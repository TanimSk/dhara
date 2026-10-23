cmake_minimum_required(VERSION 3.20)
project(encoderd CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()

# Homebrew keeps libpq keg-only on macOS.
if(APPLE)
  list(APPEND CMAKE_PREFIX_PATH /opt/homebrew/opt/libpq /opt/homebrew)
endif()

find_package(PostgreSQL REQUIRED)
find_package(CURL REQUIRED)
find_package(Threads REQUIRED)
find_package(spdlog REQUIRED)
find_package(nlohmann_json 3.10 REQUIRED)

add_executable(encoderd
  src/main.cpp
  src/db.cpp
  src/process.cpp
  src/probe.cpp
  src/encode.cpp
  src/upload.cpp
)
target_compile_options(encoderd PRIVATE -Wall -Wextra)
target_link_libraries(encoderd PRIVATE PostgreSQL::PostgreSQL CURL::libcurl Threads::Threads spdlog::spdlog nlohmann_json::nlohmann_json)

add_executable(encoderd_tests tests/tests.cpp src/encode.cpp src/process.cpp src/probe.cpp)
target_include_directories(encoderd_tests PRIVATE src)
target_link_libraries(encoderd_tests PRIVATE Threads::Threads spdlog::spdlog nlohmann_json::nlohmann_json)
