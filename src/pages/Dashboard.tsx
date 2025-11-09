import React, { useEffect, useState } from "react";
import { useData } from "@/context/DataContext";
import SearchBar from "@/components/SearchBar";
import FilterChips from "@/components/FilterChips";
import AnalysisButtons from "@/components/AnalysisButtons";
import VulnList from "@/components/VulnList";
import ExportButton from "@/components/ExportButton";
import PreferencesDrawer from "@/components/PreferencesDrawer";
import SeverityChart from "@/charts/SeverityChart";
import RiskFactorsChart from "@/charts/RiskFactorsChart";
import TrendChart from "@/charts/TrendChart";
import AIManualRelationChart from "@/charts/AIManualRelationChart";
import { headExists, getDefaultVulnsEndpoint } from "@/services/dataService";

export default function Dashboard() {
  const { summary, loadFromUrl, loading, progressBytes, ingestedCount, error } =
    useData();
  const [url, setUrl] = useState<string>(() => getDefaultVulnsEndpoint());
  const [autoLoaded, setAutoLoaded] = useState(false);

  useEffect(() => {
    if (!autoLoaded) {
      // Prefer API endpoint; fallback to demo JSON if present
      const checkAndLoad = async () => {
        const api = getDefaultVulnsEndpoint();
        if (await headExists(api)) {
          loadFromUrl(api);
        } else if (await headExists('/uiDemoData.json')) {
          loadFromUrl('/uiDemoData.json');
        }
        setAutoLoaded(true);
      };
      checkAndLoad();
    }
  }, [autoLoaded, loadFromUrl]);

  return (
    <div className="col">
      <div className="panel">
        <div className="controls" style={{ gap: ".6rem", flexWrap: "wrap" }}>
          <input
            className="flex-1 min-w-0 w-full md:w-[360px]"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…/ui_demo.json"
          />
          <button className="btn btn-primary" onClick={() => loadFromUrl(url)}>
            Load from URL
          </button>
          {/* Upload from local file removed */}
          <ExportButton />
        </div>
        <div className="tiny" style={{ marginTop: ".5rem" }}>
          Tip: Local file in public/ is served at /uiDemoData.json. For GitHub
          links, use the raw URL (raw.githubusercontent.com).
        </div>
        {(loading || ingestedCount > 0) && (
          <div className="tiny" style={{ marginTop: ".25rem" }}>
            Loading status: {loading ? "in progress" : "idle"} • Bytes read:{" "}
            {(progressBytes / (1024 * 1024)).toFixed(1)} MB • Items ingested:{" "}
            {ingestedCount.toLocaleString()}
          </div>
        )}
        {error && (
          <div className="tiny" style={{ marginTop: ".25rem", color: "#c00" }}>
            Error: {error}
          </div>
        )}
      </div>

      <SearchBar />
      <FilterChips />
      <AnalysisButtons />
      <PreferencesDrawer />

      {summary && (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-2">
          <SeverityChart />
          <RiskFactorsChart />
          <TrendChart />
          <AIManualRelationChart />
        </div>
      )}

      <VulnList />
    </div>
  );
}
