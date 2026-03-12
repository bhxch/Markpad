//! PDF generation module
//! 
//! This module provides functionality to generate PDF files from HTML content.
//! On Windows, it uses a hybrid approach with WebView2 for rendering.

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
fn merge_pdfs(input_paths: &[PathBuf], output_path: &PathBuf) -> Result<(), String> {
    use lopdf::Document;

    if input_paths.is_empty() {
        return Err("No PDFs to merge".to_string());
    }

    if input_paths.len() == 1 {
        fs::copy(&input_paths[0], output_path)
            .map_err(|e| format!("Failed to copy PDF: {}", e))?;
        return Ok(());
    }

    // Load first document as base
    let mut merged_doc =
        Document::load(&input_paths[0]).map_err(|e| format!("Failed to load first PDF: {}", e))?;

    // Merge remaining documents
    for (i, path) in input_paths.iter().skip(1).enumerate() {
        let doc = Document::load(path)
            .map_err(|e| format!("Failed to load PDF {}: {}", i + 1, e))?;

        // Get all page ObjectIds (values in the pages map)
        let pages: Vec<lopdf::ObjectId> = doc.get_pages().values().copied().collect();

        for page_id in pages {
            // Get page object
            if let Ok(page_obj) = doc.get_object(page_id) {
                // Add page to merged document
                let _ = merged_doc.add_object(page_obj.clone());
            }
        }
    }

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