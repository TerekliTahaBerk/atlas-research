# A03 integration key rotation

Prepared 2 November 2026. Execution requires the environment's G4 secret-change approval. No real key was issued, read, rotated or stored during closure.

`ATLAS_INTEGRATION_KEY` is exactly 32 random bytes encoded as base64/base64url (43 characters, optional padding). Keep it in the environment-scoped secret manager, never `NEXT_PUBLIC_*`, Git, shell arguments, logs or browser storage. Decoding rejects malformed encodings and incorrect lengths. Ciphertexts use `v1.<12-byte IV>.<ciphertext>.<16-byte tag>`, AES-256-GCM, with owner/provider AAD. Preview signatures use a separate HMAC purpose prefix and bind actor/project/connection/item/version/record hash. They grant no permissions.

## Recommended rotation: controlled reconnect

This release supports one active encryption key. It deliberately does not attempt silent bulk re-encryption or maintain an unreviewed previous-key ring. The versioned envelope permits a later reviewed key-ID format without changing historical SQL. Rotation temporarily interrupts Zotero browsing; imported papers, mappings and citations remain intact.

1. Approve the exact Atlas environment, secret version, operator and maintenance window. Verify accepted recovery evidence and identify any retained backups requiring the old secret. Never copy the old secret into the backup location.
2. Suspend Zotero connect/preview/import traffic at the approved deployment. Let in-flight requests finish (maximum three 10-second attempts plus 1.2 seconds network retry delay, excluding database latency). Do not suspend unrelated research reads.
3. Have each connection owner disconnect through Atlas. Disconnect/reconnect deletes stored ciphertext; provider-side revocation remains an explicit owner action in Zotero. An approved administrative purge would need its own exact SQL/data authorization; none is provided here.
4. Verify there are zero active connections and zero ciphertexts on revoked connections with count-only SQL under the approved operator. Stop if any owner has not disconnected. No credentials are exported or decrypted.
5. Provision a new cryptographically random 32-byte secret through the approved secret manager. Replace the environment version and restart **all** application instances together. Never mix old/new-key replicas. Do not generate the value in chat or a terminal command that prints it.
6. Each owner reconnects using their legitimately authorized read-only Zotero key. Verify owner-only status, fixture or approved provider preview/import, tamper/foreign-owner rejection, no ciphertext in responses, and disconnect ciphertext removal. Old previews must be re-created; their proof is invalid after rotation/reconnection.
7. Record only secret version IDs, counts, request IDs, operator and times. Retain old secret custody only for the explicitly approved encrypted-backup retention/legal hold; retire it through the secret manager afterward. Never restore an old deployment key automatically if new connections have already been written.

## Failure handling and verification

A missing/wrong key or altered/foreign envelope fails closed and asks for reconnection. During a failed rotation keep Zotero traffic suspended, preserve research records and resolve the named secret version; never treat decryption failure as an empty successful connection. Unit tests exercise encryption/decryption, owner/provider binding, tampering and rotation to a different 32-byte key. Integration tests exercise encrypted owner-only storage, signed preview integrity, explicit updates, disconnect and ciphertext erasure. These tests use synthetic keys; a hosted rotation rehearsal is **NOT RUN**.

Revisit a versioned key-ID envelope and a separately approved, bounded owner-bound re-encryption job only if reconnection downtime becomes unacceptable. Do not edit the existing applied `reference_interop` migration to introduce it.
