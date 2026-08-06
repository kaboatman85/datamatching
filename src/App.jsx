import { useEffect, useState } from 'react';

function App() {
  const [dbData, setDbData] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [allFields, setAllFields] = useState([]);
  const [visibleFields, setVisibleFields] = useState([]);

  useEffect(() => {
    // Note: This will fail to fetch until you set up your local SQL server later!
    fetch('http://localhost:3001/api/data')
      .then((res) => res.json())
      .then((data) => {
        setDbData(data);
        
        if (data.length > 0) {
          const fields = Object.keys(data[0]);
          setAllFields(fields);
          setVisibleFields(fields); 
        }
        
        setLoading(false);
      })
      .catch((err) => {
        console.error('Error fetching from local API:', err);
        setLoading(false);
      });
  }, []);

  const toggleField = (fieldToToggle) => {
    if (visibleFields.includes(fieldToToggle)) {
      setVisibleFields(visibleFields.filter(f => f !== fieldToToggle));
    } else {
      setVisibleFields([...visibleFields, fieldToToggle]);
    }
  };

  const selectAll = () => setVisibleFields(allFields);
  const deselectAll = () => setVisibleFields([]);

  if (loading) return <div>Connecting to txdot4svosddb6...</div>;

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-6">Database Connected</h2>
      
      {/* Field Selector UI */}
      <div className="mb-6 p-4 border border-gray-200 rounded-lg shadow-sm bg-gray-50">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-700">Select Fields to Display:</h3>
          
          <div className="space-x-3">
            <button 
              onClick={selectAll}
              className="px-3 py-1 text-sm bg-blue-100 text-blue-700 font-medium rounded hover:bg-blue-200 transition-colors"
            >
              Select All
            </button>
            <button 
              onClick={deselectAll}
              className="px-3 py-1 text-sm bg-gray-200 text-gray-700 font-medium rounded hover:bg-gray-300 transition-colors"
            >
              Deselect All
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          {allFields.map((field) => (
            <label key={field} className="flex items-center space-x-2 cursor-pointer">
              <input 
                type="checkbox" 
                checked={visibleFields.includes(field)}
                onChange={() => toggleField(field)}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-600">{field}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Table Rendered with Only Visible Fields */}
      <div className="overflow-x-auto bg-white border border-gray-200 rounded-lg shadow-sm">
        <table className="min-w-full text-sm text-left">
          <thead className="bg-gray-100 border-b border-gray-200">
            <tr>
              {visibleFields.map(field => (
                <th key={field} className="px-4 py-3 font-semibold text-gray-700">
                  {field}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dbData.map((row, index) => (
              <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                {visibleFields.map(field => (
                  <td key={field} className="px-4 py-2 text-gray-600">
                    {row[field]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default App;
