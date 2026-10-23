#include "probe.hpp"

#include <nlohmann/json.hpp>

#include <cmath>
#include <stdexcept>

#include "process.hpp"

using json = nlohmann::json;

static double parse_rate(const std::string &rate) {
  auto slash = rate.find('/');
  try {
    if (slash == std::string::npos) return std::stod(rate);
    double num = std::stod(rate.substr(0, slash)), den = std::stod(rate.substr(slash + 1));
    return den > 0 ? num / den : 0;
  } catch (...) {
    return 0;
  }
}

ProbeInfo parse_probe(const std::string &json_text) {
  ProbeInfo info;
  json doc = json::parse(json_text);
  for (const auto &s : doc.value("streams", json::array())) {
    std::string type = s.value("codec_type", "");
    if (type == "video" && !info.has_video) {
      // Skip cover art / attached pictures.
      if (s.contains("disposition") && s["disposition"].value("attached_pic", 0) == 1) continue;
      info.has_video = true;
      info.width = s.value("width", 0);
      info.height = s.value("height", 0);
      double fps = parse_rate(s.value("avg_frame_rate", "0/0"));
      if (fps < 1 || fps > 120) fps = parse_rate(s.value("r_frame_rate", "30/1"));
      info.fps = (fps >= 1 && fps <= 120) ? fps : 30.0;
      // Phone videos carry a rotation; ffmpeg auto-rotates, so swap to display dimensions.
      int rotation = 0;
      for (const auto &sd : s.value("side_data_list", json::array())) {
        if (sd.contains("rotation")) rotation = sd["rotation"].get<int>();
      }
      if (s.contains("tags") && s["tags"].contains("rotate")) rotation = std::stoi(s["tags"]["rotate"].get<std::string>());
      if (std::abs(rotation) % 180 == 90) std::swap(info.width, info.height);
      if (s.contains("duration")) info.duration = std::stod(s["duration"].get<std::string>());
    } else if (type == "audio") {
      info.has_audio = true;
    }
  }
  if (doc.contains("format") && doc["format"].contains("duration")) {
    info.duration = std::stod(doc["format"]["duration"].get<std::string>());
  }
  return info;
}

ProbeInfo probe_file(const std::string &ffprobe, const std::string &path) {
  auto res = run_process({ffprobe, "-v", "error", "-print_format", "json", "-show_streams", "-show_format", path});
  if (res.exit_code != 0 || res.output.empty()) throw std::runtime_error("ffprobe couldn't read the file");
  return parse_probe(res.output);
}
