import { useEffect } from 'react';
import FilterPanel from './components/FilterPanel';
import AnalysisWorkspace from './components/AnalysisWorkspace';
import UploadPanel from './components/UploadPanel';

export default function App() {
  useEffect(() => {
    document.body.classList.add('design-atlas');
    return () => document.body.classList.remove('design-atlas');
  }, []);

  return (
    <>
      <div className="product-banner">
        <div className="banner-content">
          <h1 className="product-name">
            Snapdata<span>数达</span>
          </h1>
          <p className="tagline">Data analysis, in a snap</p>
        </div>
      </div>

      <main className="container app-container">
        <UploadPanel />
        <FilterPanel />
        <AnalysisWorkspace />
      </main>
    </>
  );
}
