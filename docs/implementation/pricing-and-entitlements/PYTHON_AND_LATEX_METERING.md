# Python and LaTeX execution

Projects have a Compute page for Python source or a complete LaTeX document. Access follows the existing project roles. Only a current editor can enqueue, and only the submitter with current project access can see a job, cancel it or download its PDF.

## Job lifecycle and resource accounting

A PostgreSQL transaction admits one request ID, one quota hold and one queue row under the workspace quota lock. Retries of the same source with the same request ID return the existing job. An incompatible replay returns a conflict. The broker claims once with `SKIP LOCKED` and a lease token, then rechecks author and session before dispatch and during execution. Final state and quota settlement commit together. Authorization lost after admission stops the run and keeps results private. The broker repeats a dispatch only when the runner explicitly says it was busy before accepting the job.

Python reserves the requested maximum milliseconds. It charges elapsed isolated-process wall time on execution, capped at the reservation. Python retains its plan-specific single-run limit and monthly wallet, including top-ups. A personal/Free workspace may hold one Python run and a Team workspace two. Each LaTeX invocation reserves one compile and has a hard 30-second limit. A compile that reaches the engine uses a quota unit even if the TeX input fails or times out. An unstarted run or expired lease releases its hold. Each workspace may have four outstanding compute jobs across both kinds.

Source inputs are capped at 32 KiB and cleared on terminal state. Text output is capped at 32 KiB each for stdout and stderr. A generated PDF is capped at 4 MiB with 64 MiB of temporary PDFs per workspace. Outputs are accessible for 24 hours. The existing file worker and the broker reap expired leases and results. Downloads use an authenticated attachment response.

## Isolated runner

The two containers are separated into a broker and runner. The broker can claim and finalize jobs through narrow SQL functions. The runner has no database credential, research volume or Docker socket. The dedicated Compose network is internal and the runner has no published port. The runner has a read-only root, 512 MiB memory, one CPU, a 32-PID limit and a 32 MiB noexec scratch filesystem. It uses Docker's default seccomp profile with all capabilities dropped and no new privileges.

The runner creates a new source and scratch directory for every job. Landlock filters filesystem access to the interpreter or compiler, their selected runtime data, the input and the job's own scratch. An inner seccomp filter denies network syscalls, process creation, process inspection, signals to other processes and privileged kernel operations. A per-process memory, CPU, file-size and file-descriptor ceiling supplements container limits. The interpreter receives a fixed environment. Python supports its bundled standard library. pdfLaTeX runs with shell escape disabled and a fixed package set. User-requested package installation is unavailable. A watchdog kills timed-out or disconnected work, and the runner reaps it before accepting another job.

The runner qualifies both engines at boot and requires cgroup v2 and Landlock ABI 3 or later. The browser exposes execution only when both flags are enabled and the broker has recently qualified the runner against the current schema. Unsupported hosts remain unavailable.

## Controlled activation

The `compute` Compose profile is opt-in. The web and broker require `ATLAS_COMPUTE_ENABLED=1` and `ATLAS_RESOURCE_LIMITS_ENABLED=1`. Set a separate freshly generated 32-byte hex `ATLAS_COMPUTE_RUNNER_TOKEN` on the broker and runner. Keep the endpoint at `http://compute-runner:8090`. Keep payment, Founding mail and external invitation delivery off during verification.

Use the disposable runner's isolation test `ops/compute-runner/test.mjs` and `npm run test:compute`. The integration suite uses a synthetic transport by default. For real execution set `ATLAS_TEST_COMPUTE_REAL=1`, `ATLAS_TEST_COMPUTE_RUNNER_URL` to an explicit loopback-only QA runner and `ATLAS_TEST_COMPUTE_RUNNER_TOKEN` to its temporary token. Test credentials and source examples belong only in the disposable test environment.

Before a real backup, pause new compute admissions and drain active jobs. The backup role can capture job and ledger records. A snapshot taken while a job is in flight can contain its source until that snapshot expires.
