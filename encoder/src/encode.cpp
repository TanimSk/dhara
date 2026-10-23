#include "encode.hpp"

#include <algorithm>
#include <cmath>
#include <stdexcept>

namespace {
struct Rung {
  const char *name;
  int short_side;
  int maxrate_k;
};
constexpr Rung LADDER[] = {{"720p", 720, 1800}, {"480p", 480, 900}, {"360p", 360, 550}, {"240p", 240, 300}};

int even(double v) { return std::max(2, static_cast<int>(std::lround(v / 2.0)) * 2); }
}  // namespace

std::vector<Rendition> plan_renditions(const ProbeInfo &p) {
  if (!p.has_video || p.width <= 0 || p.height <= 0) throw std::runtime_error("The file has no video stream");
  bool portrait = p.height > p.width;
  int short_side = std::min(p.width, p.height);
  if (short_side < 120) throw std::runtime_error("The video resolution is too small");
  double aspect = static_cast<double>(std::max(p.width, p.height)) / short_side;

  auto make = [&](const std::string &name, int s, int maxrate) {
    int long_side = even(s * aspect);
    return Rendition{name, portrait ? s : long_side, portrait ? long_side : s, maxrate};
  };

  std::vector<Rendition> out;
  for (const auto &r : LADDER) {
    if (r.short_side <= short_side) out.push_back(make(r.name, r.short_side, r.maxrate_k));
  }
  if (out.empty()) {
    // Smaller than 240p: keep the source size as the only rendition.
    int s = even(short_side);
    out.push_back(make(std::to_string(s) + "p", s, 300));
  }
  return out;
}

std::vector<std::string> ffmpeg_args(const std::string &ffmpeg, const std::string &input, const std::string &out_dir,
                                     const ProbeInfo &probe, const std::vector<Rendition> &renditions, int threads) {
  const size_t n = renditions.size();
  int gop = std::max(2, static_cast<int>(std::lround(probe.fps * 2)));  // keyframe every 2 s

  // One decode, split into every rendition.
  std::string filter = "[0:v]split=" + std::to_string(n);
  for (size_t i = 0; i < n; ++i) filter += "[s" + std::to_string(i) + "]";
  for (size_t i = 0; i < n; ++i) {
    filter += ";[s" + std::to_string(i) + "]scale=" + std::to_string(renditions[i].width) + ":" +
              std::to_string(renditions[i].height) + "[v" + std::to_string(i) + "]";
  }

  std::vector<std::string> a = {ffmpeg, "-hide_banner", "-nostats", "-y", "-i", input, "-filter_complex", filter};
  for (size_t i = 0; i < n; ++i) a.insert(a.end(), {"-map", "[v" + std::to_string(i) + "]"});
  if (probe.has_audio)
    for (size_t i = 0; i < n; ++i) a.insert(a.end(), {"-map", "0:a:0"});

  a.insert(a.end(), {"-c:v", "libx264", "-preset", "veryfast", "-profile:v", "main", "-pix_fmt", "yuv420p", "-crf", "23",
                     "-threads", std::to_string(threads)});
  for (size_t i = 0; i < n; ++i) {
    auto idx = std::to_string(i);
    a.insert(a.end(), {"-maxrate:v:" + idx, std::to_string(renditions[i].maxrate_k) + "k", "-bufsize:v:" + idx,
                       std::to_string(renditions[i].maxrate_k * 2) + "k"});
  }
  a.insert(a.end(), {"-g", std::to_string(gop), "-keyint_min", std::to_string(gop), "-sc_threshold", "0"});
  if (probe.has_audio) a.insert(a.end(), {"-c:a", "aac", "-b:a", "96k", "-ac", "2"});

  std::string stream_map;
  for (size_t i = 0; i < n; ++i) {
    if (i) stream_map += " ";
    stream_map += "v:" + std::to_string(i);
    if (probe.has_audio) stream_map += ",a:" + std::to_string(i);
    stream_map += ",name:" + renditions[i].name;
  }
  a.insert(a.end(), {"-f", "hls", "-hls_time", "6", "-hls_playlist_type", "vod", "-hls_segment_type", "fmp4",
                     "-hls_flags", "independent_segments", "-hls_fmp4_init_filename", "init.mp4",
                     "-hls_segment_filename", out_dir + "/%v/seg_%05d.m4s", "-master_pl_name", "playlist.m3u8",
                     "-var_stream_map", stream_map, "-progress", "pipe:1", out_dir + "/%v/video.m3u8"});
  return a;
}

std::vector<std::string> thumbnail_args(const std::string &ffmpeg, const std::string &input, const std::string &output,
                                        double duration) {
  char at[32];
  std::snprintf(at, sizeof(at), "%.2f", std::max(0.0, duration * 0.10));
  return {ffmpeg, "-hide_banner", "-y", "-ss", at, "-i", input, "-frames:v", "1", "-vf", "scale=640:-2", "-q:v", "3", output};
}

long long parse_progress_line(const std::string &line) {
  static const std::string key = "out_time_us=";
  if (line.rfind(key, 0) != 0) return -1;
  try {
    return std::stoll(line.substr(key.size()));
  } catch (...) {
    return -1;
  }
}
