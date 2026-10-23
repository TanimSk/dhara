// Small self-checking tests for the pure parts of encoderd (no database, no network).
#include <cassert>
#include <iostream>

#include "encode.hpp"
#include "probe.hpp"

static int failures = 0;
#define CHECK(cond)                                                       \
  do {                                                                    \
    if (!(cond)) {                                                        \
      std::cerr << __FILE__ << ":" << __LINE__ << " FAILED: " #cond "\n"; \
      ++failures;                                                         \
    }                                                                     \
  } while (0)

int main() {
  auto landscape = parse_probe(R"({"streams":[{"codec_type":"video","width":1920,"height":1080,"avg_frame_rate":"30000/1001"},
    {"codec_type":"audio"}],"format":{"duration":"5400.5"}})");
  CHECK(landscape.has_video && landscape.has_audio);
  CHECK(landscape.duration > 5400);
  auto r = plan_renditions(landscape);
  CHECK(r.size() == 4);
  CHECK(r[0].name == "720p" && r[0].width == 1280 && r[0].height == 720);
  CHECK(r[3].name == "240p" && r[3].width == 426 && r[3].height == 240);

  // Phone video recorded portrait with a rotation tag: display is 1080x1920.
  auto phone = parse_probe(R"({"streams":[{"codec_type":"video","width":1920,"height":1080,"avg_frame_rate":"30/1",
    "side_data_list":[{"rotation":-90}]}],"format":{"duration":"60"}})");
  CHECK(phone.width == 1080 && phone.height == 1920 && !phone.has_audio);
  auto pr = plan_renditions(phone);
  CHECK(pr[0].width == 720 && pr[0].height == 1280);

  // 480p source: no upscaling.
  auto sd = parse_probe(R"({"streams":[{"codec_type":"video","width":854,"height":480,"avg_frame_rate":"25/1"}],"format":{"duration":"10"}})");
  auto sr = plan_renditions(sd);
  CHECK(sr.size() == 3 && sr[0].name == "480p");

  // Audio-only file is rejected.
  bool threw = false;
  try {
    plan_renditions(parse_probe(R"({"streams":[{"codec_type":"audio"}],"format":{"duration":"10"}})"));
  } catch (const std::exception &) {
    threw = true;
  }
  CHECK(threw);

  auto args = ffmpeg_args("ffmpeg", "in.mp4", "/tmp/out", landscape, r, 2);
  std::string joined;
  for (auto &a : args) joined += a + " ";
  CHECK(joined.find("split=4") != std::string::npos);
  CHECK(joined.find("-g 60 ") != std::string::npos);
  CHECK(joined.find("v:0,a:0,name:720p v:1,a:1,name:480p") != std::string::npos);
  auto silent = ffmpeg_args("ffmpeg", "in.mp4", "/tmp/out", phone, pr, 2);
  joined.clear();
  for (auto &a : silent) joined += a + " ";
  CHECK(joined.find("0:a:0") == std::string::npos && joined.find("v:0,name:720p") != std::string::npos);

  CHECK(parse_progress_line("out_time_us=1500000") == 1500000);
  CHECK(parse_progress_line("frame=10") == -1);

  if (failures) return 1;
  std::cout << "encoderd tests passed\n";
  return 0;
}
