import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Cockpit from "./pages/Cockpit";
import PuDetail from "./pages/PuDetail";
import Trends from "./pages/Trends";
import FcFc from "./pages/FcFc";
import FcVsBudget from "./pages/FcVsBudget";
import PeopleFlow from "./pages/PeopleFlow";
import Arve from "./pages/Arve";
import MarketUnit from "./pages/MarketUnit";
import Projects from "./pages/Projects";
import ProjectDetail from "./pages/ProjectDetail";
import People from "./pages/People";
import PersonDetail from "./pages/PersonDetail";
import Pipeline from "./pages/Pipeline";
import Bench from "./pages/Bench";
import Scenarios from "./pages/Scenarios";
import Ingestion from "./pages/Ingestion";
import Admin from "./pages/Admin";
import DQ from "./pages/DQ";
import ReviewPack from "./pages/ReviewPack";
import { useAppStore } from "./store";

export default function App() {
  const theme = useAppStore((s) => s.theme);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Cockpit />} />
        <Route path="pu" element={<Navigate to="/pu/CCA_TOTAL" replace />} />
        <Route path="pu/:code" element={<PuDetail />} />
        <Route path="trends" element={<Trends />} />
        <Route path="fcfc" element={<FcFc />} />
        <Route path="fc-vs-budget" element={<FcVsBudget />} />
        <Route path="people-flow" element={<PeopleFlow />} />
        <Route path="arve" element={<Arve />} />
        <Route path="mu" element={<MarketUnit />} />
        <Route path="projects" element={<Projects />} />
        <Route path="projects/:projectNumber" element={<ProjectDetail />} />
        <Route path="people" element={<People />} />
        <Route path="people/:localNumber" element={<PersonDetail />} />
        <Route path="pipeline" element={<Pipeline />} />
        <Route path="bench" element={<Bench />} />
        <Route path="scenarios" element={<Scenarios />} />
        <Route path="dq" element={<DQ />} />
        <Route path="review-pack" element={<ReviewPack />} />
        <Route path="ingestion" element={<Ingestion />} />
        <Route path="admin" element={<Admin />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
