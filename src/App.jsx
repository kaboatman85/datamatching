import { useState, useMemo, useEffect } from 'react';
import Papa from 'papaparse';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { useDropzone } from 'react-dropzone';

function App() {
  const [isFilesOpen, setIsFilesOpen] = useState(true);
  const [fileData, setFileData] = useState([]);
  const [currentIdIndex, setCurrentIdIndex] = useState(0);
  const [reviewedIds, setReviewedIds] = useState(new Set());
  const [showOnlyMatches, setShowOnlyMatches] = useState(true);
  const [selectedTier, setSelectedTier] = useState(null);

  const [primaryKeyMap, setPrimaryKeyMap] = useState({});
  // NEW: State to hold our custom field mappings across files
  const [fieldMappings, setFieldMappings] = useState([]); 
  
  const [selectedFieldValues, setSelectedFieldValues] = useState({});
  const [validatedRecords, setValidatedRecords] = useState([]);
  const [isValidatedOpen, setIsValidatedOpen] = useState(false);

  useEffect(() => {
    setReviewedIds(new Set());
    setCurrentIdIndex(0);
    setSelectedFieldValues({});
    setSelectedTier(null);
  }, [primaryKeyMap, fieldMappings, fileData]);

  // The engine that groups records and re-writes the keys based on your mapping buckets
  const groupedRecords = useMemo(() => {
    if (Object.keys(primaryKeyMap).length === 0) return {};
    
    return fileData.reduce((acc, fileEntry) => {
      const keyForThisFile = primaryKeyMap[fileEntry.fileName];
      if (!keyForThisFile) return acc; 

      fileEntry.data.forEach((row) => {
        const id = row[keyForThisFile];
        if (!id) return; 
        if (!acc[id]) acc[id] = [];
        
        // Build a brand new record replacing old column names with the unified master names
        const transformedRow = { sourceFile: fileEntry.fileName };

        // 1. Apply user-defined field mappings
        fieldMappings.forEach(mapping => {
          const sourceCol = mapping.map[fileEntry.fileName];
          // Ensure we don't accidentally map the primary key, and the value exists
          if (sourceCol && sourceCol !== keyForThisFile && row[sourceCol] !== undefined) {
            const mapName = mapping.name.trim() || `Mapped Field ${mapping.id}`;
            transformedRow[mapName] = row[sourceCol];
          }
        });

        // 2. Pass through the remaining unmapped fields
        Object.keys(row).forEach(k => {
          if (k === keyForThisFile) return; // The primary key is tracked automatically, don't duplicate it
          const isMapped = fieldMappings.some(m => m.map[fileEntry.fileName] === k);
          if (!isMapped) {
            transformedRow[k] = row[k];
          }
        });

        acc[id].push(transformedRow);
      });
      return acc;
    }, {});
  }, [fileData, primaryKeyMap, fieldMappings]);

  // Because the keys are unified in `groupedRecords`, the confidence calculator 
  // automatically compares the mismatched columns accurately!
  const calculateConfidence = (group) => {
    if (group.length < 2) return 100;
    const allKeys = Array.from(new Set(group.flatMap(r => Object.keys(r).filter(k => k !== 'sourceFile'))));
    let totalMatches = 0;
    let totalChecks = 0;
    for (const key of allKeys) {
      const values = group.map(r => r[key]).filter(v => v !== undefined);
      if (values.length > 1) {
        totalChecks++;
        if (values.every(v => v === values[0])) totalMatches++;
      }
    }
    return totalChecks === 0 ? 100 : Math.round((totalMatches / totalChecks) * 100);
  };

  const allIds = useMemo(() => {
    const ids = Object.keys(groupedRecords);
    let filtered = showOnlyMatches ? ids.filter(id => groupedRecords[id].length > 1) : ids;
    
    if (selectedTier) {
      filtered = filtered.filter(id => {
        const score = calculateConfidence(groupedRecords[id]);
        if (selectedTier === '0-25%') return score <= 25;
        if (selectedTier === '26-50%') return score > 25 && score <= 50;
        if (selectedTier === '51-75%') return score > 50 && score <= 75;
        if (selectedTier === '76-99%') return score > 75 && score < 100;
        if (selectedTier === '100%') return score === 100;
        return true;
      });
    }

    return filtered.sort((a, b) => calculateConfidence(groupedRecords[a]) - calculateConfidence(groupedRecords[b]));
  }, [groupedRecords, showOnlyMatches, selectedTier]);

  const currentId = allIds[currentIdIndex];
  const currentGroup = groupedRecords[currentId] || [];
  const currentConfidence = useMemo(() => calculateConfidence(currentGroup), [currentGroup]);

  useEffect(() => {
    setCurrentIdIndex(0);
  }, [allIds]);

  useEffect(() => {
    if (currentGroup && currentGroup.length > 0) {
      const initialSelections = {};
      const allKeys = Array.from(new Set(currentGroup.flatMap(r => Object.keys(r).filter(k => k !== 'sourceFile'))));
      
      allKeys.forEach(key => {
        const recordWithValue = currentGroup.find(r => r[key] !== undefined && r[key] !== "");
        initialSelections[key] = recordWithValue ? recordWithValue[key] : "";
      });
      setSelectedFieldValues(initialSelections);
    }
  }, [currentId, groupedRecords]);

  const chartData = useMemo(() => {
    const ids = Object.keys(groupedRecords);
    const totalIds = showOnlyMatches ? ids.filter(id => groupedRecords[id].length > 1) : ids;
    const total = totalIds.length;
    const reviewed = totalIds.filter(id => reviewedIds.has(id)).length;
    
    return [
      { name: `Reviewed`, value: reviewed, color: '#3b82f6' },
      { name: `Unreviewed`, value: Math.max(0, total - reviewed), color: '#ef4444' }
    ];
  }, [groupedRecords, reviewedIds, showOnlyMatches]);

  const confidenceChartData = useMemo(() => {
    const data = [
      { name: '100%', value: 0, color: '#22c55e' },
      { name: '76-99%', value: 0, color: '#a3e635' },
      { name: '51-75%', value: 0, color: '#facc15' },
      { name: '26-50%', value: 0, color: '#f59e0b' },
      { name: '0-25%', value: 0, color: '#ef4444' }
    ];

    const ids = Object.keys(groupedRecords);
    const baseIds = showOnlyMatches ? ids.filter(id => groupedRecords[id].length > 1) : ids;

    baseIds.forEach(id => {
      if (reviewedIds.has(id)) return; 
      const score = calculateConfidence(groupedRecords[id]);
      if (score <= 25) data[4].value++;
      else if (score <= 50) data[3].value++;
      else if (score <= 75) data[2].value++;
      else if (score < 100) data[1].value++;
      else data[0].value++;
    });
    
    return data;
  }, [groupedRecords, reviewedIds, showOnlyMatches]);

  const activePieData = confidenceChartData.filter(d => d.value > 0);

  const onDrop = (acceptedFiles) => {
    acceptedFiles.forEach((file) => {
      Papa.parse(file, { header: true, skipEmptyLines: true, complete: (results) => {
        setFileData(prev => prev.some(f => f.fileName === file.name) ? prev : [...prev, { fileName: file.name, data: results.data }]);
      }});
    });
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { 'text/csv': ['.csv'] } });

  const handleReviewToggle = () => {
    const isCurrentlyReviewed = reviewedIds.has(currentId);
    setReviewedIds(prev => {
      const next = new Set(prev);
      isCurrentlyReviewed ? next.delete(currentId) : next.add(currentId);
      return next;
    });
    if (!isCurrentlyReviewed && currentIdIndex < allIds.length - 1) {
      setCurrentIdIndex(i => i + 1);
    }
  };

  const handleSaveRecord = () => {
    const masterKeyName = Object.values(primaryKeyMap)[0] || "Master ID";
    const newRecord = { [masterKeyName]: currentId, ...selectedFieldValues };
    
    setValidatedRecords(prev => {
      const existingIndex = prev.findIndex(r => r[masterKeyName] === currentId);
      if (existingIndex >= 0) {
        const next = [...prev];
        next[existingIndex] = newRecord;
        return next;
      }
      return [...prev, newRecord];
    });

    if (!reviewedIds.has(currentId)) {
      setReviewedIds(prev => new Set(prev).add(currentId));
    }
    
    if (currentIdIndex < allIds.length - 1) {
      setCurrentIdIndex(i => i + 1);
    }
  };

  const removeFile = (fileName) => {
    setFileData(prev => prev.filter(x => x.fileName !== fileName));
    // Clean up mapping arrays to prevent ghost data
    setPrimaryKeyMap(prev => {
      const next = { ...prev };
      delete next[fileName];
      return next;
    });
    setFieldMappings(prev => prev.map(m => {
      const nextMap = { ...m.map };
      delete nextMap[fileName];
      return { ...m, map: nextMap };
    }));
  };

  const validatedTableKeys = Array.from(new Set(validatedRecords.flatMap(Object.keys)));
  const isFullyMapped = fileData.length > 0 && Object.keys(primaryKeyMap).length === fileData.length;

  return (
    <div className="flex flex-col min-h-screen bg-gray-100 p-4 gap-4">
      <section className="bg-white rounded-lg shadow p-6 border-t-4 border-blue-500">
        <button onClick={() => setIsFilesOpen(!isFilesOpen)} className="w-full flex justify-between items-center font-bold text-lg mb-4">
          <span>Data Ingestion & Mapping</span>
          <span>{isFilesOpen ? '▲' : '▼'}</span>
        </button>
        
        {isFilesOpen && (
          <div className="space-y-6">
            <div {...getRootProps()} className={`p-8 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}`}>
              <input {...getInputProps()} />
              <p className="text-gray-600 font-medium text-lg">Drag 'n' drop CSV files here, or click to browse</p>
            </div>

            {fileData.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {fileData.map(f => {
                  const headers = f.data.length > 0 ? Object.keys(f.data[0]) : [];
                  const isPrimaryMapped = primaryKeyMap[f.fileName];
                  return (
                    <div key={f.fileName} className={`border p-4 rounded-lg shadow-sm transition-colors ${isPrimaryMapped ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-gray-50'}`}>
                      <div className="flex justify-between items-center mb-3 border-b pb-2">
                        <h4 className="font-bold text-sm text-gray-800 truncate pr-2" title={f.fileName}>
                          {isPrimaryMapped && <span className="text-green-600 mr-2">✓</span>}
                          {f.fileName}
                        </h4>
                        <button onClick={() => removeFile(f.fileName)} className="text-red-500 hover:text-red-700 text-xs font-bold px-2 py-1 bg-red-100 rounded">Remove</button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {headers.map(header => {
                          const isPrimary = primaryKeyMap[f.fileName] === header;
                          const isFieldMapped = fieldMappings.some(m => m.map[f.fileName] === header);
                          
                          let pillStyles = 'bg-white border-blue-200 text-blue-700 hover:bg-blue-50'; // default
                          if (isPrimary) pillStyles = 'bg-green-600 border-green-700 text-white';
                          else if (isFieldMapped) pillStyles = 'bg-blue-500 border-blue-600 text-white';

                          return (
                            <div 
                              key={header}
                              draggable
                              onDragStart={(e) => e.dataTransfer.setData('text/plain', JSON.stringify({ fileName: f.fileName, header }))}
                              className={`text-xs px-2 py-1 border rounded shadow-sm cursor-grab active:cursor-grabbing transition-colors ${pillStyles}`}
                              title="Drag me to a bucket"
                            >
                              {header}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {fileData.length > 0 && (
              <div className="mt-8 border-t pt-6">
                <h3 className="font-bold text-gray-800 mb-4 text-lg">Linking Rules</h3>
                
                <div 
                  onDragEnter={(e) => e.preventDefault()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    try {
                      const data = e.dataTransfer.getData('text/plain');
                      if (data) {
                        const { fileName, header } = JSON.parse(data);
                        setPrimaryKeyMap(prev => ({ ...prev, [fileName]: header }));
                      }
                    } catch (err) {}
                  }}
                  className={`p-6 border-2 border-dashed rounded-lg text-center transition-all ${isFullyMapped ? 'border-green-500 bg-green-50 shadow-inner' : 'border-blue-400 bg-blue-50'}`}
                >
                  {Object.keys(primaryKeyMap).length > 0 ? (
                    <div className="flex flex-col items-center gap-2">
                      <span className="text-gray-600 font-medium">Primary Record Link:</span>
                      <div className="flex flex-wrap justify-center gap-3 mt-2">
                        {Object.entries(primaryKeyMap).map(([fName, col]) => (
                          <span key={fName} className="font-bold text-sm text-green-800 bg-green-200 px-3 py-1 rounded shadow-sm">
                            {fName}: <span className="text-green-900 underline">{col}</span>
                          </span>
                        ))}
                      </div>
                      <button onClick={() => setPrimaryKeyMap({})} className="mt-2 text-sm text-red-500 hover:text-red-700 underline font-medium">Clear Link</button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <p className="text-blue-800 font-bold text-lg">Primary Key Bucket (Required)</p>
                      <p className="text-blue-600 text-sm">Drag one column from <b>each</b> file to define what connects the records (e.g. Taxpayer ID).</p>
                    </div>
                  )}
                </div>

                {/* NEW: Dynamic Secondary Column Mappings */}
                {isFullyMapped && (
                  <div className="mt-6">
                    <div className="flex justify-between items-center mb-4">
                      <h4 className="font-bold text-gray-700">Unified Columns (Optional)</h4>
                      <button 
                        onClick={() => setFieldMappings(prev => [...prev, { id: Date.now(), name: '', map: {} }])} 
                        className="bg-blue-100 hover:bg-blue-200 text-blue-700 font-bold py-1 px-3 rounded text-sm transition-colors"
                      >
                        + Add Column Mapping
                      </button>
                    </div>
                    
                    {fieldMappings.length > 0 && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {fieldMappings.map(mapping => (
                          <div 
                            key={mapping.id}
                            onDragEnter={(e) => e.preventDefault()}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                              e.preventDefault();
                              try {
                                const data = e.dataTransfer.getData('text/plain');
                                if (data) {
                                  const { fileName, header } = JSON.parse(data);
                                  setFieldMappings(prev => prev.map(m => m.id === mapping.id ? { ...m, map: { ...m.map, [fileName]: header } } : m));
                                }
                              } catch (err) {}
                            }}
                            className="p-4 border-2 border-dashed border-gray-300 rounded bg-white shadow-sm"
                          >
                            <div className="flex justify-between items-center mb-3">
                              <input 
                                type="text" 
                                value={mapping.name}
                                onChange={(e) => setFieldMappings(prev => prev.map(m => m.id === mapping.id ? { ...m, name: e.target.value } : m))}
                                placeholder="Master Column Name..."
                                className="font-bold text-gray-800 border-b border-dashed border-gray-400 focus:outline-none focus:border-blue-500 px-1 w-2/3"
                              />
                              <button onClick={() => setFieldMappings(prev => prev.filter(m => m.id !== mapping.id))} className="text-red-400 hover:text-red-600 font-bold text-lg">&times;</button>
                            </div>
                            
                            <div className="flex flex-wrap gap-2 min-h-[32px] items-center bg-gray-50 p-2 rounded">
                              {Object.keys(mapping.map).length === 0 && <span className="text-sm text-gray-400 italic">Drag equivalent columns here...</span>}
                              {Object.entries(mapping.map).map(([fName, col]) => (
                                <span key={fName} className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded flex items-center gap-1 shadow-sm border border-blue-200">
                                  <span className="font-semibold truncate max-w-[80px]" title={fName}>{fName.substring(0,6)}..</span>: {col}
                                  <button onClick={() => setFieldMappings(prev => prev.map(m => { if(m.id !== mapping.id) return m; const newMap = {...m.map}; delete newMap[fName]; return {...m, map: newMap}; }))} className="ml-1 text-blue-500 hover:text-blue-900 leading-none">&times;</button>
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            
            {isFullyMapped && (
               <label className="flex items-center mt-6 text-sm font-medium text-gray-700 bg-gray-50 p-3 rounded border w-fit shadow-sm">
                 <input type="checkbox" checked={showOnlyMatches} onChange={() => setShowOnlyMatches(!showOnlyMatches)} className="mr-2 w-4 h-4 text-blue-600"/> 
                 Only show records appearing in multiple files
               </label>
            )}
          </div>
        )}
      </section>

      {isFullyMapped ? (
        <>
          <section className="bg-white rounded-lg shadow border border-gray-200 p-6">
            <h2 className="font-bold mb-4">Analytics</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h3 className="text-sm font-semibold text-center mb-2">Review Status ({reviewedIds.size} / {chartData[0].value + chartData[1].value})</h3>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={chartData} innerRadius={40} outerRadius={70} dataKey="value">
                        {chartData.map((e, i) => <Cell key={i} fill={e.color} />)}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="flex flex-col items-center w-full">
                <h3 className="text-sm font-semibold text-center mb-2 flex justify-center items-center gap-2">
                  Confidence Tiers
                  {selectedTier && (
                    <button onClick={() => setSelectedTier(null)} className="text-xs text-blue-600 hover:underline">
                      (Clear Filter)
                    </button>
                  )}
                </h3>
                
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie 
                        data={activePieData} 
                        innerRadius={40} 
                        outerRadius={70} 
                        dataKey="value"
                        labelLine={false}
                        label={(props) => {
                          const { cx, x, y, value, percent, fill } = props;
                          if (!cx || percent < 0.05) return null;
                          return (
                            <text x={x} y={y} fill={fill} textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" fontSize="12" fontWeight="bold">
                              {value}
                            </text>
                          );
                        }}
                        onClick={(data) => setSelectedTier(prev => prev === data.name ? null : data.name)}
                        className="cursor-pointer"
                      >
                        {activePieData.map((e, i) => (
                          <Cell 
                            key={i} 
                            fill={e.color} 
                            stroke={selectedTier === e.name ? '#000' : 'none'} 
                            strokeWidth={selectedTier === e.name ? 2 : 0} 
                            className="hover:opacity-80"
                          />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                
                <ul className="flex justify-center gap-3 text-sm mt-4 p-0 flex-wrap w-full">
                  {confidenceChartData.map((entry, index) => (
                    <li 
                      key={`item-${index}`} 
                      className="flex items-center gap-1 cursor-pointer hover:opacity-80"
                      onClick={() => setSelectedTier(prev => prev === entry.name ? null : entry.name)}
                    >
                      <span 
                        className="w-3 h-3 inline-block rounded-sm" 
                        style={{ backgroundColor: entry.color, border: selectedTier === entry.name ? '2px solid #000' : 'none' }}
                      ></span>
                      <span style={{ color: entry.color, fontWeight: selectedTier === entry.name ? 'bold' : 'normal' }}>
                        {entry.name} ({entry.value})
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="mt-8 border-t pt-4">
              <button 
                onClick={() => setIsValidatedOpen(!isValidatedOpen)} 
                className="w-full flex justify-between items-center font-bold text-gray-800 p-2 hover:bg-gray-50 rounded transition-colors"
              >
                <span>Validated Accounts ({validatedRecords.length})</span>
                <span>{isValidatedOpen ? '▲' : '▼'}</span>
              </button>
              
              {isValidatedOpen && validatedRecords.length > 0 && (
                <div className="mt-4 overflow-x-auto max-h-64 border rounded shadow-inner bg-gray-50">
                  <table className="min-w-full bg-white text-sm whitespace-nowrap">
                    <thead className="bg-gray-100 sticky top-0 shadow-sm">
                      <tr>
                        {validatedTableKeys.map(k => (
                          <th key={k} className="py-2 px-4 border-b text-left font-semibold text-gray-700">{k}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {validatedRecords.map((rec, i) => (
                        <tr key={i} className="border-b hover:bg-blue-50 transition-colors">
                          {validatedTableKeys.map(k => (
                            <td key={k} className="py-2 px-4 text-gray-700">{rec[k] || '-'}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {isValidatedOpen && validatedRecords.length === 0 && (
                <p className="text-sm text-gray-500 mt-2 p-2 italic">No validated records saved yet. Save a record below to see it here.</p>
              )}
            </div>
          </section>

          <main className="flex-1 bg-white rounded-lg shadow p-6">
            {currentId ? (
              <>
                <div className="flex justify-between items-center mb-6 border-b pb-4">
                  <button disabled={currentIdIndex === 0} onClick={() => setCurrentIdIndex(i => i - 1)} className="px-6 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold rounded disabled:opacity-50 transition-colors">Prev</button>
                  <div className="text-center">
                    <h2 className="text-2xl font-bold text-gray-800 mb-1">{currentId}</h2>
                    <div className="flex justify-center items-center gap-2">
                      <span className={`px-2 py-1 rounded text-xs font-bold ${currentConfidence > 90 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>Confidence: {currentConfidence}%</span>
                    </div>
                  </div>
                  <button disabled={currentIdIndex === allIds.length - 1} onClick={() => setCurrentIdIndex(i => i + 1)} className="px-6 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold rounded disabled:opacity-50 transition-colors">Next</button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {currentGroup.map((record, idx) => (
                    <div key={idx} className="border border-gray-200 p-4 rounded shadow-sm bg-white">
                      <h4 className="font-semibold mb-3 text-sm text-gray-700 border-b pb-2">Source: {record.sourceFile}</h4>
                      <div className="flex flex-col gap-1">
                        {/* 
                          The keys have already been cleaned by our mapping engine above! 
                          We just render them directly.
                        */}
                        {Object.entries(record).filter(([k]) => k !== 'sourceFile').map(([key, val]) => {
                          const isConflict = currentGroup.some(otherRec => otherRec[key] !== undefined && otherRec[key] !== val);
                          return (
                            <label 
                              key={key} 
                              className={`flex items-center text-sm py-2 px-3 rounded cursor-pointer transition-colors hover:border-blue-300 border border-transparent
                                ${isConflict ? 'bg-yellow-50' : 'bg-gray-50'}
                                ${selectedFieldValues[key] === val ? 'ring-1 ring-blue-500 bg-blue-50' : ''}
                              `}
                            >
                              <input 
                                type="radio" 
                                name={`${currentId}-${key}`} 
                                checked={selectedFieldValues[key] === val} 
                                onChange={() => setSelectedFieldValues(prev => ({ ...prev, [key]: val }))}
                                className="mr-3 w-4 h-4 text-blue-600 cursor-pointer"
                              />
                              <span className="font-bold text-gray-600 w-1/3 truncate" title={key}>{key}:</span>
                              <span className="flex-1 truncate text-gray-800" title={val}>{val}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-8 flex gap-4">
                  <button 
                    onClick={handleReviewToggle} 
                    className={`flex-1 py-3 rounded font-bold transition-colors ${reviewedIds.has(currentId) ? 'bg-gray-200 text-gray-800' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'}`}
                  >
                    {reviewedIds.has(currentId) ? 'Unmark Reviewed' : 'Skip & Mark Reviewed'}
                  </button>
                  
                  <button 
                    onClick={handleSaveRecord} 
                    className="flex-[2] py-3 rounded font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-md transition-colors"
                  >
                    Save Master Record & Advance
                  </button>
                </div>
              </>
            ) : (
               <div className="flex flex-col items-center justify-center py-16 text-gray-500">
                 <svg className="w-16 h-16 mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                 <p className="text-lg font-medium">No records match the current filter.</p>
               </div>
            )}
          </main>
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center bg-white rounded-lg shadow p-12 text-center border border-gray-200">
          <svg className="w-20 h-20 text-blue-200 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Awaiting Configuration</h2>
          <p className="text-gray-500 max-w-md">
            Upload your CSV files and drag <b>one column from each file</b> into the Bucket above to link your data.
          </p>
        </div>
      )}
    </div>
  );
}

export default App;
