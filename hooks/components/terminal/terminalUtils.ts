
// components/terminal/terminalUtils.ts
import { runDiagnostics } from '../../../styles/services/testRunner';

interface CommandResult {
    output?: string;
    newPath?: string;
    clear?: boolean;
}

const filesystem: Record<string, any> = {
    'home': {
        'user': {
            'README.md': 'This is the user directory.',
            'documents': {
                'project-plan.txt': 'Phase 1: Build the terminal.\nPhase 2: Add more features.',
            },
            'projects': {
                'aether-shunt': {
                    'package.json': '{ "name": "aether-shunt", "version": "2.0.0" }'
                }
            },
        }
    }
};

const resolvePath = (currentPath: string, targetPath: string): string => {
    if (targetPath.startsWith('/')) {
        return targetPath;
    }
    const pathParts = currentPath.split('/').filter(p => p);
    const targetParts = targetPath.split('/').filter(p => p);

    for (const part of targetParts) {
        if (part === '..') {
            pathParts.pop();
        } else if (part !== '.') {
            pathParts.push(part);
        }
    }
    return '/' + pathParts.join('/');
};

const getObjectByPath = (path: string): any => {
    if (path === '/') return filesystem;
    const parts = path.split('/').filter(p => p);
    let current = filesystem;
    for (const part of parts) {
        if (typeof current === 'object' && current !== null && part in current) {
            current = current[part];
        } else {
            return null;
        }
    }
    return current;
};

const formatPath = (path: string): string => {
    if (path === '/') return '/';
    if (path.startsWith('/home/user')) {
        return '~' + path.substring('/home/user'.length);
    }
    return path;
};

const getAbsolutePath = (currentPath: string): string => {
    if (currentPath === '~') return '/home/user';
    if (currentPath.startsWith('~/')) return '/home/user' + currentPath.substring(1);
    return currentPath;
};

const ls = (path: string): string => {
    const absolutePath = getAbsolutePath(path);
    const node = getObjectByPath(absolutePath);
    if (typeof node === 'object' && node !== null) {
        return Object.keys(node).join('\t');
    }
    return `ls: cannot access '${path}': Not a directory`;
};

const cd = (currentPath: string, target: string): { newPath?: string; error?: string } => {
    const absoluteCurrentPath = getAbsolutePath(currentPath);
    const newAbsolutePath = resolvePath(absoluteCurrentPath, target || '/home/user');
    const node = getObjectByPath(newAbsolutePath);
    if (typeof node === 'object' && node !== null) {
        return { newPath: formatPath(newAbsolutePath) };
    }
    return { error: `cd: no such file or directory: ${target}` };
};

const cat = (currentPath: string, file: string): string => {
    const absoluteCurrentPath = getAbsolutePath(currentPath);
    const filePath = resolvePath(absoluteCurrentPath, file);
    const node = getObjectByPath(filePath);
    
    // Check if the node exists and is a string (file content)
    if (typeof node === 'string') {
        return node;
    }
    
    // Return error if file not found or is a directory
    return `cat: ${file}: No such file or not a file`;
};

const help = (): string => {
    return `Available commands:
  help       - Show this help message
  ls [path]  - List directory contents
  cd <dir>   - Change the current directory
  cat <file> - Display file contents
  echo ...   - Display a line of text
  test       - Run system diagnostics and Type Error tests
  clear      - Clear the terminal screen (Ctrl+L)`;
};

export const executeCommand = async (command: string, currentPath: string): Promise<CommandResult> => {
    const [cmd, ...args] = command.trim().split(/\s+/);

    switch (cmd) {
        case '':
            return {};
        case 'help':
            return { output: help() };
        case 'ls':
            return { output: ls(args[0] || currentPath) };
        case 'cd':
            const cdResult = cd(currentPath, args[0] || '~');
            if (cdResult.error) return { output: cdResult.error };
            return { newPath: cdResult.newPath };
        case 'cat':
            if (!args[0]) return { output: 'cat: missing operand' };
            return { output: cat(currentPath, args[0]) };
        case 'echo':
            return { output: args.join(' ') };
        case 'clear':
            return { clear: true };
        case 'test':
        case 'diagnose':
            const report = await runDiagnostics();
            return { output: report };
        default:
            return { output: `command not found: ${cmd}` };
    }
};
