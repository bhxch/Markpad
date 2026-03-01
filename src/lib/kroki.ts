import pako from 'pako';

const DEFAULT_KROKI_HOST = 'https://kroki.io';

export const SUPPORTED_DIAGRAMS = [
    'plantuml', 'c4plantuml', 
    'graphviz', 'dot', 
    'ditaa', 
    'excalidraw', 
    'blockdiag', 'nwdiag', 'actdiag', 'seqdiag', 
    'erd', 'nomnoml', 'bpmn', 'pikchr', 'svgbob', 'vega', 'vegalite'
];

export function createKrokiUrl(type: string, text: string, host?: string): string {
    // Map aliases
    if (type === 'dot') type = 'graphviz';
    
    const krokiHost = host || DEFAULT_KROKI_HOST;
    const data = new TextEncoder().encode(text);
    const compressed = pako.deflate(data, { level: 9 });
    
    // Convert to base64url safely
    let str = '';
    for (let i = 0; i < compressed.length; i++) {
        str += String.fromCharCode(compressed[i]);
    }
    const base64 = btoa(str)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

    return `${krokiHost}/${type}/svg/${base64}`;
}
