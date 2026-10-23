#pragma once

#include <string>

struct ProbeInfo {
  bool has_video = false;
  bool has_audio = false;
  int width = 0;   // display width (after rotation)
  int height = 0;  // display height (after rotation)
  double fps = 30.0;
  double duration = 0.0;
};

// Parses `ffprobe -print_format json -show_streams -show_format` output.
ProbeInfo parse_probe(const std::string &json_text);
ProbeInfo probe_file(const std::string &ffprobe, const std::string &path);
