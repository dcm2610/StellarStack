"use client";

import { useEffect } from "react";
import { useRouter, useParams } from "next/navigation";

export default function ServerPage() {
  const router = useRouter();
  const params = useParams();
  const serverId = params.id as string;

  useEffect(() => {
    // Redirect to overview page
    router.replace(`/servers/${serverId}/overview`);
  }, [router, serverId]);

  return null;
}
