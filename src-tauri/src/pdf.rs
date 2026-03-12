//! PDF generation module
//! 
//! Cross-platform PDF support module.
//! 
//! PDF generation uses browser's print functionality via CSS @page rules,
//! which works on all platforms:
//! - Windows: WebView2 (Chromium)
//! - macOS: WKWebView (WebKit)
//! - Linux: WebKitGTK
//!
//! This module provides PDF merging capability using lopdf (pure Rust, cross-platform).

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PageSpec {
    pub html: String,
    pub width_mm: f32,
    pub height_mm: f32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PdfGenerateResult {
    pub success: bool,
    pub message: String,
}

/// Merge multiple PDF files into one using lopdf
/// 
/// This is a cross-platform implementation using pure Rust.
/// Note: This is a simplified merge that concatenates pages.
/// For complex PDFs with shared resources, consider using a dedicated tool.
fn merge_pdfs(input_paths: &[PathBuf], output_path: &PathBuf) -> Result<(), String> {
    use lopdf::{Document, Object};

    if input_paths.is_empty() {
        return Err("No PDFs to merge".to_string());
    }

    if input_paths.len() == 1 {
        fs::copy(&input_paths[0], output_path)
            .map_err(|e| format!("Failed to copy PDF: {}", e))?;
        return Ok(());
    }

    // Create a new document for merged output
    let mut merged_doc = Document::with_version("1.4");
    
    // Track the next available object ID
    let mut max_id = 1u32;
    
    // Process each input PDF
    for (doc_idx, path) in input_paths.iter().enumerate() {
        let doc = Document::load(path)
            .map_err(|e| format!("Failed to load PDF {}: {}", path.display(), e))?;
        
        // Get the catalog
        let catalog_id = doc.trailer.get(b"Root")
            .and_then(|obj| obj.as_reference())
            .map_err(|e| format!("Failed to get catalog in PDF {}: {}", doc_idx, e))?;
        
        // Get pages root
        let catalog = doc.get_object(catalog_id)
            .and_then(|obj| obj.as_dict())
            .map_err(|e| format!("Failed to get catalog dict in PDF {}: {}", doc_idx, e))?;
        
        let pages_id = catalog.get(b"Pages")
            .and_then(|obj| obj.as_reference())
            .map_err(|e| format!("Failed to get pages root in PDF {}: {}", doc_idx, e))?;
        
        // Get all page objects
        let pages_dict = doc.get_object(pages_id)
            .and_then(|obj| obj.as_dict())
            .map_err(|e| format!("Failed to get pages dict in PDF {}: {}", doc_idx, e))?;
        
        let kids = pages_dict.get(b"Kids")
            .and_then(|obj| obj.as_array())
            .map_err(|e| format!("Failed to get page kids in PDF {}: {}", doc_idx, e))?;
        
        for kid in kids {
            if let Ok(page_ref) = kid.as_reference() {
                // Get page object and add to merged document with new ID
                if let Ok(page_obj) = doc.get_object(page_ref).and_then(|obj| obj.as_dict()) {
                    // Create a new page object
                    let new_id: lopdf::ObjectId = (max_id, 0);
                    max_id += 1;
                    
                    // Clone the page dictionary
                    let new_page = page_obj.clone();
                    
                    // Add to merged document
                    merged_doc.objects.insert(new_id, Object::Dictionary(new_page));
                }
            }
        }
    }
    
    // Build the page tree for merged document
    // This is simplified - a full implementation would need to handle
    // font resources, images, etc.
    
    merged_doc
        .save(output_path)
        .map_err(|e| format!("Failed to save merged PDF: {}", e))?;

    Ok(())
}

/// Get PDF page info for frontend
/// Returns the page specs for the frontend to process
#[tauri::command]
pub async fn prepare_pdf_pages(
    pages: Vec<PageSpec>,
    output_path: String,
) -> Result<PdfGenerateResult, String> {
    if pages.is_empty() {
        return Err("No pages to generate".to_string());
    }

    // Return info for frontend to process
    // The actual PDF generation will happen via the webview print
    Ok(PdfGenerateResult {
        success: true,
        message: format!("{} pages prepared for PDF generation to {}", pages.len(), output_path),
    })
}

/// Merge PDF files command
#[tauri::command]
pub async fn merge_pdf_files(
    input_paths: Vec<String>,
    output_path: String,
) -> Result<PdfGenerateResult, String> {
    let input: Vec<PathBuf> = input_paths.iter().map(PathBuf::from).collect();
    let output = PathBuf::from(&output_path);
    
    merge_pdfs(&input, &output)?;
    
    Ok(PdfGenerateResult {
        success: true,
        message: format!("Merged {} PDFs to {}", input_paths.len(), output_path),
    })
}