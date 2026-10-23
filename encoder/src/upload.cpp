#include "upload.hpp"

#include <curl/curl.h>
#include <spdlog/spdlog.h>

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cstdio>
#include <filesystem>
#include <mutex>
#include <stdexcept>
#include <thread>
#include <vector>

namespace fs = std::filesystem;

namespace {

std::string content_type(const std::string &path) {
  if (path.ends_with(".m3u8")) return "application/vnd.apple.mpegurl";
  if (path.ends_with(".m4s")) return "video/iso.segment";
  if (path.ends_with(".mp4")) return "video/mp4";
  if (path.ends_with(".jpg")) return "image/jpeg";
  return "application/octet-stream";
}

std::string cache_control(const std::string &path) {
  if (path.ends_with(".m4s") || path.ends_with(".mp4")) return "public, max-age=31536000, immutable";
  if (path.ends_with(".m3u8")) return "public, max-age=3600";
  return "public, max-age=300";
}

size_t discard(char *, size_t size, size_t nmemb, void *) { return size * nmemb; }

bool put_file(const Config &cfg, const fs::path &file, const std::string &key) {
  FILE *fp = std::fopen(file.c_str(), "rb");
  if (!fp) return false;
  CURL *curl = curl_easy_init();
  std::string url = cfg.edge_url + "/__internal/r2/" + key;
  curl_slist *headers = nullptr;
  headers = curl_slist_append(headers, ("Authorization: Bearer " + cfg.edge_secret).c_str());
  headers = curl_slist_append(headers, ("Content-Type: " + content_type(key)).c_str());
  headers = curl_slist_append(headers, ("X-Cache-Control: " + cache_control(key)).c_str());
  headers = curl_slist_append(headers, "Expect:");

  curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
  curl_easy_setopt(curl, CURLOPT_UPLOAD, 1L);
  curl_easy_setopt(curl, CURLOPT_READDATA, fp);
  curl_easy_setopt(curl, CURLOPT_INFILESIZE_LARGE, static_cast<curl_off_t>(fs::file_size(file)));
  curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
  curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, discard);
  curl_easy_setopt(curl, CURLOPT_TIMEOUT, 300L);
  curl_easy_setopt(curl, CURLOPT_NOSIGNAL, 1L);

  CURLcode rc = curl_easy_perform(curl);
  long code = 0;
  curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &code);
  curl_slist_free_all(headers);
  curl_easy_cleanup(curl);
  std::fclose(fp);
  if (rc != CURLE_OK || code != 200) {
    spdlog::warn("PUT {} failed: {} HTTP {}", key, curl_easy_strerror(rc), code);
    return false;
  }
  return true;
}

}  // namespace

void http_global_init() { curl_global_init(CURL_GLOBAL_DEFAULT); }

long long upload_dir(const Config &cfg, const std::string &dir, const std::string &prefix) {
  std::vector<fs::path> files;
  for (const auto &entry : fs::recursive_directory_iterator(dir)) {
    if (entry.is_regular_file()) files.push_back(entry.path());
  }
  // Upload media before playlists so a playlist never points at a missing segment.
  std::stable_partition(files.begin(), files.end(), [](const fs::path &p) { return p.extension() != ".m3u8"; });
  auto split = std::find_if(files.begin(), files.end(), [](const fs::path &p) { return p.extension() == ".m3u8"; });

  std::atomic<long long> total{0};
  std::atomic<bool> failed{false};

  auto run_batch = [&](std::vector<fs::path>::iterator begin, std::vector<fs::path>::iterator end) {
    std::atomic<size_t> next{0};
    size_t count = static_cast<size_t>(end - begin);
    std::vector<std::thread> pool;
    int workers = std::max(1, std::min<int>(cfg.upload_parallel, static_cast<int>(count)));
    for (int w = 0; w < workers; ++w) {
      pool.emplace_back([&] {
        for (size_t i; !failed && (i = next++) < count;) {
          const fs::path &file = *(begin + i);
          std::string key = prefix + fs::relative(file, dir).generic_string();
          bool ok = false;
          for (int attempt = 0; attempt < 3 && !ok; ++attempt) {
            if (attempt) std::this_thread::sleep_for(std::chrono::seconds(2 * attempt));
            ok = put_file(cfg, file, key);
          }
          if (!ok) {
            failed = true;
            return;
          }
          total += static_cast<long long>(fs::file_size(file));
        }
      });
    }
    for (auto &t : pool) t.join();
  };

  run_batch(files.begin(), split);
  if (!failed) run_batch(split, files.end());
  if (failed) throw std::runtime_error("Uploading the encoded files failed");
  return total;
}

bool notify_django(const Config &cfg, const std::string &video_id) {
  CURL *curl = curl_easy_init();
  std::string url = cfg.django_url + "/api/v1/internal/encoder/videos/" + video_id + "/sync";
  curl_slist *headers = curl_slist_append(nullptr, ("X-Internal-Secret: " + cfg.internal_secret).c_str());
  curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
  curl_easy_setopt(curl, CURLOPT_POST, 1L);
  curl_easy_setopt(curl, CURLOPT_POSTFIELDS, "");
  curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
  curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, discard);
  curl_easy_setopt(curl, CURLOPT_TIMEOUT, 15L);
  curl_easy_setopt(curl, CURLOPT_NOSIGNAL, 1L);
  CURLcode rc = curl_easy_perform(curl);
  long code = 0;
  curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &code);
  curl_slist_free_all(headers);
  curl_easy_cleanup(curl);
  if (rc != CURLE_OK || code != 200) {
    spdlog::error("Django sync for {} failed: {} HTTP {}", video_id, curl_easy_strerror(rc), code);
    return false;
  }
  return true;
}
