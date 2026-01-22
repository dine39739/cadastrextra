import React, { useState, useEffect, useCallback } from 'react';
import {
  extractDataFromFileWithGemini,
  synthesizeResultsWithGemini,
} from './services/geminiService';
import { exportToExcel } from './services/excelService';
import { readFileAsBase64, readFileAsText } from './utils/fileUtils';
import {
  filterAndNormalizeData,
  groupAndAggregateLots,
} from './utils/dataProcessing';
import type { AggregatedGroup, Lot, ExtractedLot } from './types';
import FilterInputs from './components/FilterInputs';
import FileDropzone from './components/FileDropzone';
import FileList from './components/FileList';
import ActionButtons from './components/ActionButtons';
import StatusMessage from './components/StatusMessage';
import ResultsDisplay from './components/ResultsDisplay';
import GeminiAnalysis from './components/GeminiAnalysis';
import DebugInfo from './components/DebugInfo';

const App: React.FC = () => {
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [section, setSection] = useState<string>('');
  const [plan, setPlan] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('Prêt pour l\'analyse.');
  const [debugInfo, setDebugInfo] = useState<string>('');
  const [aggregatedGroups, setAggregatedGroups] =
    useState<Map<string, AggregatedGroup> | null>(null);
  const [finalLots, setFinalLots] = useState<Lot[]>([]);
  const [geminiAnalysis, setGeminiAnalysis] = useState<string>('');
  const [geminiStatus, setGeminiStatus] = useState<string>('En attente...');

  const updateSubmitButtonState = useCallback(() => {
    if (isProcessing) return;
    if (uploadedFiles.length === 0) {
      setStatusMessage('Veuillez déposer un ou plusieurs fichiers.');
    } else if (!section.trim()) {
      setStatusMessage('Spécifiez la section à rechercher.');
    } else {
      setStatusMessage(`${uploadedFiles.length} fichier(s) prêt(s).`);
    }
  }, [section, uploadedFiles.length, isProcessing]);

  useEffect(() => {
    updateSubmitButtonState();
  }, [updateSubmitButtonState]);

  const resetState = () => {
    setAggregatedGroups(null);
    setFinalLots([]);
    setGeminiAnalysis('');
    setGeminiStatus('En attente...');
    setDebugInfo('');
  };

  const handleRemoveFile = (indexToRemove: number) => {
    setUploadedFiles(currentFiles => currentFiles.filter((_, index) => index !== indexToRemove));
  };

  const handleAnalyze = async () => {
    if (!section.trim() || uploadedFiles.length === 0 || isProcessing) return;

    setIsProcessing(true);
    resetState();
    let allExtractedLots: ExtractedLot[] = [];

    try {
      setDebugInfo('Lancement de l\'analyse globale...\n');
      
      for (let i = 0; i < uploadedFiles.length; i++) {
        const file = uploadedFiles[i];
        setStatusMessage(`Traitement : ${file.name} (${i + 1}/${uploadedFiles.length})`);
        
        const mimeType = file.type === 'application/pdf' ? 'application/pdf' : 'text/html';
        const fileContent = mimeType === 'application/pdf' 
          ? await readFileAsBase64(file) 
          : await readFileAsText(file);

        const rawData = await extractDataFromFileWithGemini(fileContent, mimeType, section, file.name);
        allExtractedLots = allExtractedLots.concat(rawData);
        setDebugInfo(prev => `${prev}✓ ${file.name} : ${rawData.length} lots extraits\n`);
      }

      setStatusMessage('Agrégation des résultats...');
      const filteredData = filterAndNormalizeData(allExtractedLots, section, plan);
      const groups = groupAndAggregateLots(filteredData);
      setAggregatedGroups(groups);

      const consolidated = Array.from(groups.values()).flatMap(g => g.lots);
      setFinalLots(consolidated);

      if (consolidated.length > 0) {
        setGeminiStatus('Génération de la synthèse finale...');
        const analysis = await synthesizeResultsWithGemini(consolidated);
        setGeminiAnalysis(analysis);
        setGeminiStatus('Synthèse terminée.');
        setStatusMessage(`${consolidated.length} lots uniques consolidés.`);
      } else {
        setStatusMessage('Aucun résultat trouvé pour cette section/plan.');
        setGeminiStatus('Pas de données à synthétiser.');
      }

    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setStatusMessage(`Erreur : ${msg}`);
      setDebugInfo(prev => `${prev}\n✗ ERREUR : ${msg}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 md:p-8">
      <div className="bg-white p-8 rounded-xl shadow-lg border border-slate-200">
        <header className="text-center pb-4 mb-6 border-b-2 border-blue-200">
          <h1 className="text-2xl sm:text-3xl font-bold text-blue-800">
            Extracteur Cadastral Multi-Fichiers 📄
          </h1>
          <p className="text-sm text-slate-500 mt-2 italic">Analyse par Intelligence Artificielle (Gemini 3 Pro)</p>
        </header>

        <main>
          <FilterInputs section={section} setSection={setSection} plan={plan} setPlan={setPlan} disabled={isProcessing} />
          <FileDropzone onFilesAdded={setUploadedFiles} disabled={isProcessing} />
          <FileList files={uploadedFiles} onRemoveFile={handleRemoveFile} />
          
          <StatusMessage message={statusMessage} />
          
          <ActionButtons
            onAnalyze={handleAnalyze}
            onExport={() => exportToExcel(finalLots)}
            isProcessing={isProcessing}
            canAnalyze={section.trim() !== '' && uploadedFiles.length > 0}
            canExport={finalLots.length > 0 && !isProcessing}
          />
          
          <div className="mt-8 space-y-8">
            <ResultsDisplay aggregatedGroups={aggregatedGroups} />
            <GeminiAnalysis 
              status={geminiStatus} 
              analysis={geminiAnalysis}
              show={finalLots.length > 0 || isProcessing}
            />
            <DebugInfo log={debugInfo} />
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;