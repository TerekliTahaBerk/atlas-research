#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <linux/landlock.h>
#include <seccomp.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/prctl.h>
#include <sys/resource.h>
#include <sys/stat.h>
#include <sys/syscall.h>
#include <unistd.h>

/* Landlock ABI 3. Debian's bookworm headers can predate this right. */
#ifndef LANDLOCK_ACCESS_FS_TRUNCATE
#define LANDLOCK_ACCESS_FS_TRUNCATE (1ULL << 14)
#endif

static const uint64_t readable = LANDLOCK_ACCESS_FS_READ_FILE | LANDLOCK_ACCESS_FS_READ_DIR;
static const uint64_t scratch = LANDLOCK_ACCESS_FS_READ_FILE | LANDLOCK_ACCESS_FS_READ_DIR |
    LANDLOCK_ACCESS_FS_WRITE_FILE | LANDLOCK_ACCESS_FS_REMOVE_DIR | LANDLOCK_ACCESS_FS_REMOVE_FILE |
    LANDLOCK_ACCESS_FS_MAKE_DIR | LANDLOCK_ACCESS_FS_MAKE_REG | LANDLOCK_ACCESS_FS_REFER |
    LANDLOCK_ACCESS_FS_TRUNCATE;

static void unavailable(int stage) {
    /* Only the trusted close-on-exec pipe can signal a setup failure. */
    dprintf(3, "E%d", stage);
    _exit(125);
}

static void limit(int resource, rlim_t amount) {
    struct rlimit l = { amount, amount };
    if (setrlimit(resource, &l) != 0) unavailable(2);
}

static void allow_path(int rules, const char *name, uint64_t access, int optional) {
    int fd = open(name, O_PATH | O_CLOEXEC);
    if (fd < 0 && optional && errno == ENOENT) return;
    if (fd < 0) unavailable(3);
    struct stat st;
    if (fstat(fd, &st) != 0) unavailable(3);
    if (!S_ISDIR(st.st_mode)) access &= ~LANDLOCK_ACCESS_FS_READ_DIR;
    struct landlock_path_beneath_attr path = { .allowed_access = access, .parent_fd = fd };
    if (syscall(SYS_landlock_add_rule, rules, LANDLOCK_RULE_PATH_BENEATH, &path, 0) != 0)
        unavailable(4);
    close(fd);
}

static void confine_files(const char *source, const char *work, const char *program, int latex) {
    if (syscall(SYS_landlock_create_ruleset, NULL, 0, LANDLOCK_CREATE_RULESET_VERSION) < 3)
        unavailable(5);
    const struct landlock_ruleset_attr attr = {
        .handled_access_fs = scratch | LANDLOCK_ACCESS_FS_EXECUTE |
            LANDLOCK_ACCESS_FS_MAKE_CHAR | LANDLOCK_ACCESS_FS_MAKE_SOCK |
            LANDLOCK_ACCESS_FS_MAKE_FIFO | LANDLOCK_ACCESS_FS_MAKE_BLOCK |
            LANDLOCK_ACCESS_FS_MAKE_SYM
    };
    int rules = syscall(SYS_landlock_create_ruleset, &attr, sizeof(attr), 0);
    if (rules < 0) unavailable(6);

    /* Runtime libraries are immutable. Only the selected tool and its system
       loader may be executed; there is no shell or writable executable path. */
    allow_path(rules, "/usr/lib", readable, 0);
    allow_path(rules, "/usr/lib64", readable, 1);
    allow_path(rules, "/etc/ld.so.cache", LANDLOCK_ACCESS_FS_READ_FILE, 1);
    allow_path(rules, "/dev/null", LANDLOCK_ACCESS_FS_READ_FILE | LANDLOCK_ACCESS_FS_WRITE_FILE, 0);
    allow_path(rules, "/dev/urandom", LANDLOCK_ACCESS_FS_READ_FILE, 0);
    allow_path(rules, program, LANDLOCK_ACCESS_FS_READ_FILE | LANDLOCK_ACCESS_FS_EXECUTE, 0);
#if defined(__x86_64__)
    allow_path(rules, "/lib64/ld-linux-x86-64.so.2", LANDLOCK_ACCESS_FS_EXECUTE, 0);
#elif defined(__aarch64__)
    allow_path(rules, "/lib/ld-linux-aarch64.so.1", LANDLOCK_ACCESS_FS_EXECUTE, 0);
#else
#error "Only linux/amd64 and linux/arm64 are qualified Atlas runner targets"
#endif
    if (latex) {
        allow_path(rules, "/usr/share/texlive", readable, 0);
        allow_path(rules, "/usr/share/texmf", readable, 1);
        allow_path(rules, "/usr/share/fonts", readable, 1);
        allow_path(rules, "/usr/share/fontconfig", readable, 1);
        allow_path(rules, "/var/lib/texmf", readable, 0);
        allow_path(rules, "/etc/texmf", readable, 0);
        allow_path(rules, "/etc/fonts", readable, 1);
    }
    allow_path(rules, source, LANDLOCK_ACCESS_FS_READ_FILE, 0);
    allow_path(rules, work, scratch, 0);
    if (syscall(SYS_landlock_restrict_self, rules, 0) != 0) unavailable(7);
    close(rules);
}

static void deny(scmp_filter_ctx ctx, const char *name, int result) {
    const int nr = seccomp_syscall_resolve_name(name);
    if (nr != __NR_SCMP_ERROR && seccomp_rule_add(ctx, SCMP_ACT_ERRNO(result), nr, 0) != 0)
        unavailable(8);
}

static void confine_syscalls(void) {
    scmp_filter_ctx ctx = seccomp_init(SCMP_ACT_ALLOW);
    if (!ctx) unavailable(8);
    /* No network, subprocesses, child threads, namespace changes, process
       inspection or signals into the trusted service. All restrictions
       persist if the runtime attempts to exec again. */
    const char *blocked[] = {
        "socket", "socketpair", "socketcall", "connect", "bind", "listen", "accept", "accept4",
        "clone", "fork", "vfork", "setns", "unshare",
        "kill", "tkill", "tgkill", "rt_sigqueueinfo", "rt_tgsigqueueinfo",
        "ptrace", "process_vm_readv", "process_vm_writev", "pidfd_open", "pidfd_getfd", "pidfd_send_signal",
        "mount", "umount2", "pivot_root", "fsopen", "fsconfig", "fsmount", "fspick",
        "open_tree", "move_mount", "mount_setattr", "open_by_handle_at", "name_to_handle_at",
        "keyctl", "add_key", "request_key", "bpf", "perf_event_open", "userfaultfd",
        "io_uring_setup", "io_uring_enter", "io_uring_register",
        "shmget", "shmat", "shmdt", "shmctl", "msgget", "msgsnd", "msgrcv", "msgctl",
        "semget", "semop", "semtimedop", "semctl", "ipc",
        "mq_open", "mq_notify", "mq_timedsend", "mq_timedreceive", "mq_unlink",
        "memfd_create", "memfd_secret", "inotify_init", "inotify_init1", "inotify_add_watch",
        "fanotify_init", "fanotify_mark",
        "symlink", "symlinkat", "link", "linkat", "mknod", "mknodat",
        "setgroups", "setuid", "setgid", "setresuid", "setresgid", "setreuid", "setregid",
        "setfsuid", "setfsgid", "setrlimit", "execveat"
    };
    for (size_t i = 0; i < sizeof(blocked) / sizeof(blocked[0]); i++) deny(ctx, blocked[i], EPERM);
    deny(ctx, "clone3", ENOSYS);
    if (seccomp_rule_add(ctx, SCMP_ACT_ERRNO(EPERM), SCMP_SYS(prlimit64), 1,
        SCMP_A2(SCMP_CMP_NE, 0)) != 0) unavailable(8);
    if (seccomp_rule_add(ctx, SCMP_ACT_ERRNO(EPERM), SCMP_SYS(prlimit64), 1,
        SCMP_A0(SCMP_CMP_NE, 0)) != 0) unavailable(8);
    if (seccomp_load(ctx) != 0) unavailable(9);
    seccomp_release(ctx);
}

int main(int argc, char **argv) {
    if (argc != 6 || getuid() == 0 || geteuid() == 0 || getuid() != geteuid() ||
        syscall(SYS_close_range, 4U, ~0U, 0) != 0)
        unavailable(1);
    const int latex = strcmp(argv[1], "latex") == 0;
    if (!latex && strcmp(argv[1], "python") != 0) unavailable(1);
    char *end = NULL;
    const unsigned long cpu = strtoul(argv[5], &end, 10);
    if (!end || *end || cpu < 1 || cpu > (latex ? 30UL : 900UL)) unavailable(1);
    const char *program = latex ? "/usr/bin/pdflatex" : "/usr/bin/python3";
    if (chdir(argv[3]) != 0 || prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0 ||
        prctl(PR_SET_DUMPABLE, 0, 0, 0, 0) != 0) unavailable(1);
    limit(RLIMIT_CPU, cpu);
    limit(RLIMIT_AS, (latex ? 256 : 192) * 1024ULL * 1024);
    limit(RLIMIT_FSIZE, 4 * 1024ULL * 1024);
    limit(RLIMIT_NOFILE, 48);
    limit(RLIMIT_NPROC, 16);
    limit(RLIMIT_CORE, 0);
    umask(0077);

    if (clearenv() != 0 ||
        setenv("HOME", argv[3], 1) || setenv("TMPDIR", argv[3], 1) ||
        setenv("LANG", "C.UTF-8", 1) || setenv("TZ", "UTC", 1)) unavailable(1);
    if (latex && (setenv("TEXINPUTS", argv[4], 1) ||
        setenv("openin_any", "p", 1) || setenv("openout_any", "p", 1) ||
        setenv("SOURCE_DATE_EPOCH", "1", 1) ||
        setenv("FORCE_SOURCE_DATE", "1", 1))) unavailable(1);

    confine_files(argv[2], argv[3], program, latex);
    confine_syscalls();
    if (fcntl(3, F_SETFD, FD_CLOEXEC) != 0 || write(3, "S", 1) != 1)
        unavailable(10);
    if (latex) {
        execl(program, program, "-no-shell-escape", "-no-parse-first-line",
            "-halt-on-error", "-file-line-error", "-interaction=nonstopmode",
            "-jobname=main", "-output-directory=.", "main.tex", (char *)NULL);
    } else {
        execl(program, program, "-I", "-B", "-S", "-u", argv[2], (char *)NULL);
    }
    unavailable(11);
}
