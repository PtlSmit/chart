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
import { getDefaultVulnsEndpoint } from "@/services/dataService";

export default function Dashboard() {
  const { summary, loadFromUrl, loading, progressBytes, ingestedCount, error } =
    useData();
  const [url, setUrl] = useState<string>(() => getDefaultVulnsEndpoint());
  const [autoLoaded, setAutoLoaded] = useState(false);

  useEffect(() => {
    if (!autoLoaded) {
      // Probe API availability with a lightweight GET to /summary
      const checkAndLoad = async () => {
        try {
          const vulnsUrl = getDefaultVulnsEndpoint();
          const base = vulnsUrl.replace(/\/?vulns\/?$/, "");
          const summary = `${base}/summary`;
          const resp = await fetch(summary, { method: "GET" });
          if (resp.ok) {
            // Use the configured endpoint (base or /vulns both accepted)
            loadFromUrl(vulnsUrl);
          }
        } catch (_) {
          // ignore; user can input API URL manually
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
            className="flex-1 min-w-0 w-full md:w-[360px]"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://localhost:8787/api/v1 or …/api/v1/vulns"
          />
          <button className="btn btn-primary" onClick={() => loadFromUrl(url)}>
            Load from URL
          </button>
          {/* In remote mode, only API endpoints are supported */}
          <ExportButton />
        </div>
        <div className="tiny" style={{ marginTop: ".5rem" }}>
          Tip: Point to an API base (e.g. http://localhost:8787/api/v1 or the
          full /vulns endpoint). Configure via VITE_API_URL for dev.
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
