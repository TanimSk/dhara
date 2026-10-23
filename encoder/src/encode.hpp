#pragma once

#include <string>
#include <vector>

#include "probe.hpp"

struct Rendition {
  std::string name;  // "720p"
  int width = 0;
  int height = 0;
  int maxrate_k = 0;
};

// The H.264 ladder (docs/PLAN.md): only rungs at or below the source's short side.
std::vector<Rendition> plan_renditions(const ProbeInfo &probe);

std::vector<std::string> ffmpeg_args(const std::string &ffmpeg, const std::string &input, const std::string &out_dir,
                                     const ProbeInfo &probe, const std::vector<Rendition> &renditions, int threads);

std::vector<std::string> thumbnail_args(const std::string &ffmpeg, const std::string &input, const std::string &output,
                                        double duration);

// Parses one `-progress pipe:1` line; returns microseconds when it's out_time_us, else -1.
long long parse_progress_line(const std::string &line);
