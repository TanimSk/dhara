#include "db.hpp"

#include <sys/select.h>

Db::Db(const std::string &conninfo) : conninfo_(conninfo) { reconnect(); }

Db::~Db() {
  if (conn_) PQfinish(conn_);
}

bool Db::ok() const { return conn_ && PQstatus(conn_) == CONNECTION_OK; }

void Db::reconnect() {
  if (conn_) PQfinish(conn_);
  conn_ = PQconnectdb(conninfo_.c_str());
  if (PQstatus(conn_) != CONNECTION_OK) throw DbError(std::string("connect: ") + PQerrorMessage(conn_));
  for (const auto &ch : channels_) exec("LISTEN " + ch);
}

std::vector<Row> Db::exec(const std::string &sql, const std::vector<std::optional<std::string>> &params) {
  std::vector<const char *> values;
  values.reserve(params.size());
  for (const auto &p : params) values.push_back(p ? p->c_str() : nullptr);

  PGresult *res = PQexecParams(conn_, sql.c_str(), static_cast<int>(values.size()), nullptr, values.data(), nullptr, nullptr, 0);
  auto status = PQresultStatus(res);
  if (status != PGRES_COMMAND_OK && status != PGRES_TUPLES_OK) {
    std::string err = PQerrorMessage(conn_);
    PQclear(res);
    throw DbError(err);
  }
  std::vector<Row> rows;
  int n = PQntuples(res), cols = PQnfields(res);
  for (int r = 0; r < n; ++r) {
    Row row;
    for (int c = 0; c < cols; ++c) {
      if (PQgetisnull(res, r, c)) row.emplace_back(std::nullopt);
      else row.emplace_back(std::string(PQgetvalue(res, r, c), PQgetlength(res, r, c)));
    }
    rows.push_back(std::move(row));
  }
  PQclear(res);
  return rows;
}

void Db::listen(const std::string &channel) {
  channels_.push_back(channel);
  exec("LISTEN " + channel);
}

bool Db::wait_for_notify(int seconds) {
  int sock = PQsocket(conn_);
  if (sock < 0) throw DbError("no socket");
  fd_set fds;
  FD_ZERO(&fds);
  FD_SET(sock, &fds);
  timeval tv{seconds, 0};
  int rc = select(sock + 1, &fds, nullptr, nullptr, &tv);
  if (rc < 0) return false;  // interrupted (signal)
  if (!PQconsumeInput(conn_)) throw DbError(std::string("consume: ") + PQerrorMessage(conn_));
  bool got = false;
  while (PGnotify *n = PQnotifies(conn_)) {
    got = true;
    PQfreemem(n);
  }
  return got;
}
