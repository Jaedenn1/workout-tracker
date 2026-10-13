import HybridHistory from "../../src/components/HybridHistory";
import HistoryManager from "../../src/components/HistoryManager";
import { PageShell } from "../../src/ui";

export default function HistoryPage() {
  return (
    <PageShell>
      <HybridHistory />
      <HistoryManager />
    </PageShell>
  );
}
