// encoderd: takes encode jobs from PostgreSQL, runs ffmpeg once per source into the HLS ladder,
// uploads the result to R2 (through the edge Worker) and marks the video ready.

#include <spdlog/spdlog.h>
#include <sys/resource.h>

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <csignal>
#include <filesystem>
#include <mutex>
#include <nlohmann/json.hpp>
#include <thread>

#include "config.hpp"
#include "db.hpp"
#include "encode.hpp"
#include "probe.hpp"
#include "process.hpp"
#include "upload.hpp"

namespace fs = std::filesystem;
using json = nlohmann::json;

static std::atomic<bool> g_stop{false};
static std::atomic<pid_t> g_child{0};

static void on_signal(int) {
  g_stop = true;
  if (pid_t pid = g_child.load()) kill(pid, SIGTERM);
}

struct Job {
  std::string id, video_id, library_id, source_path;
  int attempts = 0;
};

// A failure the retry can't fix (not a video, unreadable file).
struct PermanentError : std::runtime_error {
  using std::runtime_error::runtime_error;
};

// ---------- queue ----------

static void requeue_stale(Db &db) {
  auto rows = db.exec(
      "UPDATE encode_job SET status='queued', locked_by='', progress=0 "
      "WHERE status='running' AND heartbeat_at < now() - interval '2 minutes' RETURNING video_id");
  for (const auto &r : rows) {
    db.exec("UPDATE video SET status='queued' WHERE id=$1 AND status='encoding'", {r[0]});
    spdlog::warn("Requeued stale job for video {}", *r[0]);
  }
}

static std::optional<Job> claim(Db &db, const Config &cfg) {
  return in_transaction(db, [&]() -> std::optional<Job> {
    auto rows = db.exec(
        "SELECT j.id, j.video_id, v.library_id, v.source_path, j.attempts "
        "FROM encode_job j JOIN video v ON v.id = j.video_id "
        "WHERE j.status='queued' ORDER BY j.id FOR UPDATE OF j SKIP LOCKED LIMIT 1");
    if (rows.empty()) return std::nullopt;
    Job job{*rows[0][0], *rows[0][1], *rows[0][2], rows[0][3].value_or(""), std::stoi(*rows[0][4]) + 1};
    db.exec(
        "UPDATE encode_job SET status='running', locked_by=$1, heartbeat_at=now(), started_at=now(), "
        "attempts=attempts+1, progress=0, log_tail='' WHERE id=$2",
        {cfg.worker_id, job.id});
    db.exec("UPDATE video SET status='encoding', updated_at=now() WHERE id=$1", {job.video_id});
    return job;
  });
}

// ---------- heartbeat ----------

class Heartbeat {
 public:
  Heartbeat(const Config &cfg, std::string job_id) : db_(cfg.database_url), job_id_(std::move(job_id)) {
    thread_ = std::thread([this] { loop(); });
  }
  ~Heartbeat() {
    {
      std::lock_guard lk(m_);
      done_ = true;
    }
    cv_.notify_all();
    thread_.join();
  }
  void set_progress(int p) { progress_ = p; }

 private:
  void loop() {
    std::unique_lock lk(m_);
    int last = -1;
    while (!done_) {
      int p = progress_.load();
      try {
        db_.exec("UPDATE encode_job SET heartbeat_at=now(), progress=$1 WHERE id=$2", {std::to_string(p), job_id_});
      } catch (const std::exception &e) {
        spdlog::warn("heartbeat failed: {}", e.what());
      }
      last = p;
      // Wake every 3 s to publish progress, heartbeat at least every 15 s.
      for (int i = 0; i < 5 && !done_ && progress_.load() == last; ++i) cv_.wait_for(lk, std::chrono::seconds(3));
    }
  }

  Db db_;
  std::string job_id_;
  std::atomic<int> progress_{0};
  std::mutex m_;
  std::condition_variable cv_;
  bool done_ = false;
  std::thread thread_;
};

// ---------- one job ----------

static json run_job(const Config &cfg, const Job &job, Heartbeat &hb, const std::string &log_path, long long &storage_bytes) {
  if (job.source_path.empty() || !fs::exists(job.source_path)) throw PermanentError("The uploaded file is missing");

  ProbeInfo probe;
  try {
    probe = probe_file(cfg.ffprobe, job.source_path);
  } catch (const std::exception &) {
    throw PermanentError("This file isn't a video we can read");
  }
  std::vector<Rendition> renditions;
  try {
    renditions = plan_renditions(probe);
  } catch (const std::exception &e) {
    throw PermanentError(e.what());
  }
  if (probe.duration <= 0) throw PermanentError("Couldn't read the video's duration");

  fs::path work = fs::path(cfg.scratch_dir) / job.video_id;
  fs::remove_all(work);
  fs::path out = work / "out";
  for (const auto &r : renditions) fs::create_directories(out / r.name);

  spdlog::info("Encoding {} ({}x{}, {:.0f}s, {} renditions)", job.video_id, probe.width, probe.height, probe.duration,
               renditions.size());
  auto started = std::chrono::steady_clock::now();
  auto args = ffmpeg_args(cfg.ffmpeg, job.source_path, out.string(), probe, renditions, cfg.threads);
  auto res = run_process(
      args, log_path,
      [&](const std::string &line) {
        long long us = parse_progress_line(line);
        if (us >= 0) hb.set_progress(std::min(90, static_cast<int>(us / 1e6 / probe.duration * 90)));
      },
      [&](pid_t pid) {
        g_child = pid;
        setpriority(PRIO_PROCESS, pid, cfg.nice_level);
      });
  g_child = 0;
  if (g_stop) throw std::runtime_error("encoderd is shutting down");
  if (res.exit_code != 0) throw std::runtime_error("ffmpeg exited with code " + std::to_string(res.exit_code));
  auto secs = std::chrono::duration_cast<std::chrono::seconds>(std::chrono::steady_clock::now() - started).count();
  spdlog::info("Encoded {} in {}s ({:.2f}x realtime)", job.video_id, secs, probe.duration / std::max<long long>(1, secs));

  auto thumb = run_process(thumbnail_args(cfg.ffmpeg, job.source_path, (out / "thumbnail.jpg").string(), probe.duration));
  if (thumb.exit_code != 0) spdlog::warn("Thumbnail failed for {}", job.video_id);

  hb.set_progress(92);
  std::string prefix = job.library_id + "/" + job.video_id + "/";
  storage_bytes = upload_dir(cfg, out.string(), prefix);
  hb.set_progress(100);
  fs::remove_all(work);

  json rends = json::array();
  for (const auto &r : renditions)
    rends.push_back({{"name", r.name}, {"width", r.width}, {"height", r.height}, {"maxrate_kbps", r.maxrate_k}});
  return {{"renditions", rends}, {"duration", probe.duration}, {"width", probe.width}, {"height", probe.height},
          {"thumbnail", fs::exists(out / "thumbnail.jpg") || thumb.exit_code == 0}, {"prefix", prefix}};
}

static void finish_ok(Db &db, const Job &job, const json &meta, long long storage_bytes) {
  in_transaction(db, [&] {
    db.exec(
        "UPDATE video SET status='ready', renditions=$1::jsonb, duration_s=$2, width=$3, height=$4, storage_bytes=$5, "
        "thumbnail_key=$6, error='', updated_at=now() WHERE id=$7",
        {meta["renditions"].dump(), std::to_string(meta["duration"].get<double>()), std::to_string(meta["width"].get<int>()),
         std::to_string(meta["height"].get<int>()), std::to_string(storage_bytes),
         meta["thumbnail"].get<bool>() ? std::optional<std::string>(meta["prefix"].get<std::string>() + "thumbnail.jpg")
                                       : std::optional<std::string>(""),
         job.video_id});
    db.exec("UPDATE encode_job SET status='done', progress=100, finished_at=now() WHERE id=$1", {job.id});
  });
}

static void finish_failed(Db &db, const Config &cfg, const Job &job, const std::string &error, const std::string &log_tail,
                          bool permanent) {
  bool retry = !permanent && job.attempts < cfg.max_attempts && !g_stop;
  bool shutdown = g_stop.load();
  in_transaction(db, [&] {
    if (retry || shutdown) {
      // Shutting down isn't the job's fault: give the attempt back.
      db.exec(
          "UPDATE encode_job SET status='queued', locked_by='', progress=0, log_tail=$1, "
          "attempts = attempts - $2 WHERE id=$3",
          {log_tail, shutdown ? "1" : "0", job.id});
      db.exec("UPDATE video SET status='queued', updated_at=now() WHERE id=$1", {job.video_id});
    } else {
      db.exec("UPDATE encode_job SET status='failed', finished_at=now(), log_tail=$1 WHERE id=$2", {log_tail, job.id});
      db.exec("UPDATE video SET status='failed', error=$1, updated_at=now() WHERE id=$2", {error, job.video_id});
    }
  });
  spdlog::error("Job {} for video {} failed (attempt {}): {}{}", job.id, job.video_id, job.attempts, error,
                retry ? " - will retry" : "");
}

int main() {
  Config cfg;
  spdlog::set_pattern("%Y-%m-%d %H:%M:%S.%e [%^%l%$] %v");
  std::signal(SIGTERM, on_signal);
  std::signal(SIGINT, on_signal);
  std::signal(SIGPIPE, SIG_IGN);
  http_global_init();
  fs::create_directories(cfg.scratch_dir);
  if (cfg.edge_secret.empty() || cfg.internal_secret.empty())
    spdlog::warn("EDGE_INTERNAL_SECRET / INTERNAL_SECRET not set; uploads and Django sync will fail");

  spdlog::info("encoderd {} starting (threads={}, nice={})", cfg.worker_id, cfg.threads, cfg.nice_level);
  std::unique_ptr<Db> db;

  while (!g_stop) {
    try {
      if (!db || !db->ok()) {
        db = std::make_unique<Db>(cfg.database_url);
        db->listen("encode_jobs");
        spdlog::info("Connected; waiting for jobs");
      }
      requeue_stale(*db);
      auto job = claim(*db, cfg);
      if (!job) {
        db->wait_for_notify(30);  // NOTIFY encode_jobs, or poll every 30 s
        continue;
      }

      notify_django(cfg, job->video_id);
      fs::create_directories(cfg.scratch_dir);
      std::string log_path = (fs::path(cfg.scratch_dir) / (job->video_id + ".log")).string();
      try {
        long long storage = 0;
        json meta;
        {
          Heartbeat hb(cfg, job->id);
          meta = run_job(cfg, *job, hb, log_path, storage);
        }
        finish_ok(*db, *job, meta, storage);
        spdlog::info("Video {} is ready ({} bytes)", job->video_id, storage);
      } catch (const PermanentError &e) {
        finish_failed(*db, cfg, *job, e.what(), tail_lines(log_path, 50), true);
      } catch (const std::exception &e) {
        finish_failed(*db, cfg, *job, "Encoding failed. Try uploading the file again.",
                      std::string(e.what()) + "\n" + tail_lines(log_path, 50), false);
      }
      fs::remove(log_path);
      fs::remove_all(fs::path(cfg.scratch_dir) / job->video_id);
      notify_django(cfg, job->video_id);
    } catch (const DbError &e) {
      spdlog::error("Database error: {}; reconnecting in 5 s", e.what());
      db.reset();
      std::this_thread::sleep_for(std::chrono::seconds(5));
    }
  }
  spdlog::info("encoderd stopped");
  return 0;
}
