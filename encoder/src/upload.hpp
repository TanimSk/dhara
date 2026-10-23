#pragma once

#include <string>

#include "config.hpp"

// Uploads every file under `dir` to R2 (through the edge Worker) at `prefix + relative path`,
// with `parallel` concurrent uploads. Returns total bytes uploaded. Throws on failure.
long long upload_dir(const Config &cfg, const std::string &dir, const std::string &prefix);

// Tell Django a video changed (pushes KV config, removes the source after success).
bool notify_django(const Config &cfg, const std::string &video_id);

void http_global_init();
