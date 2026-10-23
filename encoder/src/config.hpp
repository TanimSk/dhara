#pragma once
// encoderd is configured entirely through environment variables.

#include <cstdlib>
#include <string>
#include <unistd.h>

inline std::string env_or(const char *name, const std::string &fallback) {
  const char *v = std::getenv(name);
  return (v && *v) ? std::string(v) : fallback;
}

struct Config {
  std::string database_url = env_or("DATABASE_URL", "dbname=dhara");
  std::string scratch_dir = env_or("SCRATCH_DIR", "/tmp/encoderd");
  std::string ffmpeg = env_or("FFMPEG", "ffmpeg");
  std::string ffprobe = env_or("FFPROBE", "ffprobe");
  // Where finished files go: the edge Worker's internal API writes them into R2.
  std::string edge_url = env_or("EDGE_INTERNAL_URL", "http://127.0.0.1:8787");
  std::string edge_secret = env_or("EDGE_INTERNAL_SECRET", "");
  // Django callback that pushes KV config after a video changes.
  std::string django_url = env_or("DJANGO_INTERNAL_URL", "http://127.0.0.1:8000");
  std::string internal_secret = env_or("INTERNAL_SECRET", "");
  int threads = std::stoi(env_or("ENCODER_THREADS", "2"));
  int nice_level = std::stoi(env_or("ENCODER_NICE", "15"));
  int upload_parallel = std::stoi(env_or("UPLOAD_PARALLEL", "8"));
  int max_attempts = std::stoi(env_or("MAX_ATTEMPTS", "3"));
  std::string worker_id = env_or("WORKER_ID", hostname() + ":" + std::to_string(getpid()));

  static std::string hostname() {
    char buf[256] = {0};
    gethostname(buf, sizeof(buf) - 1);
    return buf;
  }
};
