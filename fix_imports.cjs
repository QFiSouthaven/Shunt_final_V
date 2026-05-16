const fs = require('fs');
const path = require('path');

function processDirectory(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            processDirectory(fullPath);
        } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            let originalContent = content;
            
            content = content.replace(/from\s+['"](?:\.\.\/)+services([^'"]*)['"]/g, "from '@/styles/services$1'");
            content = content.replace(/from\s+['"](?:\.\.\/)+context([^'"]*)['"]/g, "from '@/styles/services/context$1'");
            content = content.replace(/from\s+['"](?:\.\.\/)+types([^'"]*)['"]/g, "from '@/types$1'");
            content = content.replace(/from\s+['"](?:\.\.\/)+utils([^'"]*)['"]/g, "from '@/utils$1'");
            content = content.replace(/from\s+['"](?:\.\.\/)+hooks([^'"]*)['"]/g, "from '@/hooks$1'");
            content = content.replace(/from\s+['"](?:\.\.\/)+lib([^'"]*)['"]/g, "from '@/lib$1'");

            if (content !== originalContent) {
                fs.writeFileSync(fullPath, content);
                console.log('Fixed', fullPath);
            }
        }
    }
}

processDirectory(path.join(process.cwd(), 'hooks'));
processDirectory(path.join(process.cwd(), 'styles/services'));
