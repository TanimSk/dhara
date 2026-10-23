#pragma once
// Minimal RAII wrapper over libpq: parameterized queries and LISTEN/NOTIFY.

#include <libpq-fe.h>

#include <optional>
#include <stdexcept>
#include <string>
#include <vector>

struct DbError : std::runtime_error {
  using std::runtime_error::runtime_error;
};

using Row = std::vector<std::optional<std::string>>;

class Db {
 public:
  explicit Db(const std::string &conninfo);
  ~Db();
  Db(const Db &) = delete;
  Db &operator=(const Db &) = delete;

  // Runs a statement; NULL params are passed as std::nullopt.
  std::vector<Row> exec(const std::string &sql, const std::vector<std::optional<std::string>> &params = {});
  void listen(const std::string &channel);
  // Waits up to `seconds` for a NOTIFY. Returns true if one arrived.
  bool wait_for_notify(int seconds);
  bool ok() const;
  void reconnect();

 private:
  std::string conninfo_;
  PGconn *conn_ = nullptr;
  std::vector<std::string> channels_;
};

// Run a block inside BEGIN/COMMIT, rolling back on exceptions.
template <typename F>
auto in_transaction(Db &db, F &&fn) {
  db.exec("BEGIN");
  try {
    if constexpr (std::is_void_v<decltype(fn())>) {
      fn();
      db.exec("COMMIT");
    } else {
      auto result = fn();
      db.exec("COMMIT");
      return result;
    }
  } catch (...) {
    try {
      db.exec("ROLLBACK");
    } catch (...) {
    }
    throw;
  }
}
