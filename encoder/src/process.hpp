#pragma once
// Spawn child processes with posix_spawn, streaming stdout line by line.

#include <functional>
#include <string>
#include <sys/types.h>
#include <vector>

struct ProcessResult {
  int exit_code = -1;
  std::string output;  // captured stdout when no line callback is given
};

// Runs argv; stderr goes to `stderr_path` (or /dev/null). If on_line is set, each stdout line is
// passed to it instead of being captured. `on_spawn` receives the child pid (for nice / kill).
ProcessResult run_process(const std::vector<std::string> &argv, const std::string &stderr_path = "",
                          const std::function<void(const std::string &)> &on_line = nullptr,
                          const std::function<void(pid_t)> &on_spawn = nullptr);

std::string tail_lines(const std::string &path, size_t n);
