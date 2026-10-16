/* Local BSD flock holder for KiroCrew's native store protocol. */
#include <sys/file.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <errno.h>
#include <ctype.h>
#include <fcntl.h>
#include <limits.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

static int acquire(const char *path, int directory) {
  int flags = directory ? O_RDONLY | O_DIRECTORY : O_RDWR | O_CREAT;
  int fd = open(path, flags | O_NOFOLLOW, 0644);
  if (fd < 0) return -1;
  struct stat opened, named;
  if (fstat(fd, &opened) || lstat(path, &named) ||
      opened.st_dev != named.st_dev || opened.st_ino != named.st_ino ||
      opened.st_uid != geteuid() ||
      (directory ? !S_ISDIR(opened.st_mode) : (!S_ISREG(opened.st_mode) || opened.st_nlink != 1))) {
    close(fd); errno = EINVAL; return -1;
  }
  if (flock(fd, LOCK_EX | LOCK_NB)) { int err = errno; close(fd); errno = err; return -1; }
  return fd;
}

static int gateway_running(int fd) {
  char buffer[65];
  ssize_t count = pread(fd, buffer, sizeof(buffer) - 1, 0);
  if (count <= 0 || count >= (ssize_t)sizeof(buffer) - 1) return 0;
  buffer[count] = '\0';
  char *end;
  errno = 0;
  long pid = strtol(buffer, &end, 10);
  if (end == buffer || errno || pid <= 0 || pid > INT_MAX) return 0;
  while (*end && isspace((unsigned char)*end)) end++;
  if (*end) return 0;
  return kill((pid_t)pid, 0) == 0 || errno == EPERM;
}

int main(int argc, char **argv) {
  if (argc != 4) return 64;
  int descriptors[3] = {-1, -1, -1};
  int status = 0;
  /* Match the native gateway -> directory inode -> hooks store lock order. */
  for (int index = 0; index < 3; index++) {
    descriptors[index] = acquire(argv[index + 1], index == 1);
    if (descriptors[index] < 0) { status = errno == EAGAIN || errno == EWOULDBLOCK ? 75 : 74; goto done; }
  }
  /* A running gateway may own an in-memory copy even between flock holds. */
  if (gateway_running(descriptors[0])) { status = 75; goto done; }
  if (puts("READY") == EOF || fflush(stdout)) { status = 74; goto done; }
  char buffer[16];
  for (;;) {
    ssize_t count = read(STDIN_FILENO, buffer, sizeof(buffer));
    if (count == 0) break;
    if (count < 0 && errno != EINTR) { status = 74; break; }
  }
done:
  for (int index = 2; index >= 0; index--) if (descriptors[index] >= 0) {
    flock(descriptors[index], LOCK_UN);
    close(descriptors[index]);
  }
  return status;
}
