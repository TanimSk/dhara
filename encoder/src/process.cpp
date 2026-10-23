#include "process.hpp"

#include <fcntl.h>
#include <spawn.h>
#include <sys/wait.h>
#include <unistd.h>

#include <cstring>
#include <deque>
#include <fstream>
#include <stdexcept>

extern char **environ;

ProcessResult run_process(const std::vector<std::string> &argv, const std::string &stderr_path,
                          const std::function<void(const std::string &)> &on_line,
                          const std::function<void(pid_t)> &on_spawn) {
  int out_pipe[2];
  if (pipe(out_pipe) != 0) throw std::runtime_error("pipe failed");

  posix_spawn_file_actions_t actions;
  posix_spawn_file_actions_init(&actions);
  posix_spawn_file_actions_adddup2(&actions, out_pipe[1], STDOUT_FILENO);
  posix_spawn_file_actions_addclose(&actions, out_pipe[0]);
  posix_spawn_file_actions_addclose(&actions, out_pipe[1]);
  posix_spawn_file_actions_addopen(&actions, STDIN_FILENO, "/dev/null", O_RDONLY, 0);
  std::string err_target = stderr_path.empty() ? "/dev/null" : stderr_path;
  posix_spawn_file_actions_addopen(&actions, STDERR_FILENO, err_target.c_str(), O_WRONLY | O_CREAT | O_TRUNC, 0644);

  std::vector<char *> args;
  for (const auto &a : argv) args.push_back(const_cast<char *>(a.c_str()));
  args.push_back(nullptr);

  pid_t pid;
  int rc = posix_spawnp(&pid, args[0], &actions, nullptr, args.data(), environ);
  posix_spawn_file_actions_destroy(&actions);
  close(out_pipe[1]);
  if (rc != 0) {
    close(out_pipe[0]);
    throw std::runtime_error("spawn " + argv[0] + ": " + std::strerror(rc));
  }
  if (on_spawn) on_spawn(pid);

  ProcessResult result;
  std::string pending;
  char buf[4096];
  ssize_t n;
  while ((n = read(out_pipe[0], buf, sizeof(buf))) > 0) {
    if (!on_line) {
      result.output.append(buf, n);
      continue;
    }
    pending.append(buf, n);
    size_t pos;
    while ((pos = pending.find('\n')) != std::string::npos) {
      on_line(pending.substr(0, pos));
      pending.erase(0, pos + 1);
    }
  }
  close(out_pipe[0]);

  int status = 0;
  while (waitpid(pid, &status, 0) < 0 && errno == EINTR) {
  }
  result.exit_code = WIFEXITED(status) ? WEXITSTATUS(status) : 128 + WTERMSIG(status);
  return result;
}

std::string tail_lines(const std::string &path, size_t n) {
  std::ifstream in(path);
  std::deque<std::string> lines;
  std::string line;
  while (std::getline(in, line)) {
    lines.push_back(line);
    if (lines.size() > n) lines.pop_front();
  }
  std::string out;
  for (const auto &l : lines) out += l + "\n";
  return out;
}
