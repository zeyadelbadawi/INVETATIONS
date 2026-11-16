import { z } from "zod";

// Zod compiles fast paths with `new Function` when the page allows eval, and
// probes for that by trying it. Under the strict Content-Security-Policy
// (src/lib/security/csp.ts) the probe is refused and reported as a violation,
// even though Zod catches it. Turning the compiler off skips the probe; the
// schemas parse the same either way.
z.config({ jitless: true });
