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

export default function Dashboard() {
  const { summary, loadFromUrl, loading, progressBytes, ingestedCount, error } =
    useData();
  const [url, setUrl] = useState("/uiDemoData.json");
  const [autoLoaded, setAutoLoaded] = useState(false);

  useEffect(() => {
    if (!autoLoaded) {
      // Auto-load local copy only if it exists (avoid showing global loading banner on 404)
      const checkAndLoad = async () => {
        try {
          const res = await fetch("/uiDemoData.json", { method: "HEAD" });
          if (res.ok) {
            loadFromUrl("/uiDemoData.json");
          }
        } catch {
          // ignore — demo file not present
        } finally {
          setAutoLoaded(true);
        }
      };
      checkAndLoad();
    }
  }, [autoLoaded, loadFromUrl]);

  return (
    <div className="col">
      <div className="panel">
        <div className="controls" style={{ gap: ".6rem", flexWrap: "wrap" }}>
          <input
            style={{ minWidth: 360 }}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…/ui_demo.json"
          />
          <button className="primary" onClick={() => loadFromUrl(url)}>
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
        <div className="grid cols-3">
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
