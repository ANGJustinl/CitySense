import { estimateTrafficInfo } from "@/server/maps/traffic";

export async function runTrafficRefreshWorker() {
  return {
    status: "completed" as const,
    sample: estimateTrafficInfo({
      origin: { lat: 31.224, lng: 121.459 },
      destination: { lat: 31.226, lng: 121.447 },
      mode: "walking"
    })
  };
}
