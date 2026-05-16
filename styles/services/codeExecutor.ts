// services/codeExecutor.ts

// --- Pyodide Setup ---
let pyodideInstance: any = null;
let pyodideLoadingPromise: Promise<any> | null = null;

async function getPyodide() {
    if (pyodideInstance) {
        return pyodideInstance;
    }
    if (pyodideLoadingPromise) {
        return await pyodideLoadingPromise;
    }
    pyodideLoadingPromise = (async () => {
        console.log("Loading Pyodide...");
        const pyodide = await (window as any).loadPyodide();
        console.log("Pyodide loaded successfully.");
        pyodideInstance = pyodide;
        return pyodide;
    })();
    return await pyodideLoadingPromise;
}

async function executePython(code: string): Promise<string> {
    try {
        const pyodide = await getPyodide();
        let stdout = '';
        let stderr = '';
        pyodide.setStdout({
            batched: (str: string) => { stdout += str + '\n'; }
        });
        pyodide.setStderr({
            batched: (str: string) => { stderr += str + '\n'; }
        });
        
        await pyodide.loadPackagesFromImports(code);
        const result = await pyodide.runPythonAsync(code);

        pyodide.setStdout({});
        pyodide.setStderr({});

        if (stderr) {
            return `Error:\n${stderr}`;
        }
        
        let output = stdout;
        if (result !== undefined) {
             output += (output ? '\n' : '') + `Return value: ${result}`;
        }

        return output || 'Code executed successfully with no output.';
    } catch (e: any) {
        return `Error: ${e.message}`;
    }
}


// --- JavaScript Worker Setup ---
const workerCode = `
self.onmessage = (event) => {
    const { code } = event.data;
    try {
        const logs = [];
        const originalLog = console.log;
        console.log = (...args) => {
            logs.push(args.map(arg => {
                try {
                    return JSON.stringify(arg, null, 2);
                } catch {
                    return String(arg);
                }
            }).join(' '));
        };
        
        const result = new Function(code)();

        console.log = originalLog;
        
        let output = logs.join('\\n');
        if (result !== undefined) {
            output += (output ? '\\n' : '') + 'Return value: ' + String(result);
        }
        self.postMessage({ result: output || 'Code executed successfully with no output.' });
    } catch (error) {
        self.postMessage({ error: error.message });
    }
};
`;
const workerBlob = new Blob([workerCode], { type: 'application/javascript' });
const workerUrl = URL.createObjectURL(workerBlob);

async function executeJavaScript(code: string): Promise<string> {
    return new Promise((resolve) => {
        const worker = new Worker(workerUrl);
        worker.onmessage = (event) => {
            if (event.data.error) {
                resolve(`Error: ${event.data.error}`);
            } else {
                resolve(event.data.result);
            }
            worker.terminate();
        };
        worker.onerror = (error) => {
            resolve(`Worker Error: ${error.message}`);
            worker.terminate();
        };
        worker.postMessage({ code });
    });
}


export async function executeCode(language: 'javascript' | 'python' | string, code: string): Promise<string> {
    if (language === 'javascript' || language === 'js') {
        return executeJavaScript(code);
    }
    if (language === 'python' || language === 'py') {
        return executePython(code);
    }
    return Promise.resolve(`Execution for language "${language}" is not supported.`);
}
