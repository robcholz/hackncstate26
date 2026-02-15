import { Suspense } from "react";

import { LinkGateway } from "@/components/link-gateway";

export default function OpenPage() {
  return (
    <Suspense fallback={<main className="gateway-shell">Loading...</main>}>
      <LinkGateway />
    </Suspense>
  );
}
