import pako from 'pako';

const KROKI_BASE_URL = 'https://kroki.io';

export const SUPPORTED_DIAGRAMS = [
    'plantuml', 'c4plantuml', 
    'graphviz', 'dot', 
    'ditaa', 
    'excalidraw', 
    'blockdiag', 'nwdiag', 'actdiag', 'seqdiag', 
    'erd', 'nomnoml', 'bpmn', 'pikchr', 'svgbob', 'vega', 'vegalite'
];

export function createKrokiUrl(type: string, text: string): string {
    // Map aliases
    if (type === 'dot') type = 'graphviz';
    
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

    return `${KROKI_BASE_URL}/${type}/svg/${base64}`;
}
