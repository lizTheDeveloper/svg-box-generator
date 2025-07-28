"use client"

import { useState } from "react"
import type { Globals, BookJob } from "@/lib/types"
import { generatePlacedParts } from "@/lib/generator"
import { renderSheetsAsSvgs } from "@/lib/svg"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { BookList } from "@/components/book-list"
import { GlobalsForm } from "@/components/globals-form"
import { Download, Package } from "lucide-react"
import saveAs from "file-saver"
import { useToast } from "@/components/ui/use-toast"

const defaultGlobals: Globals = {
  sheet_w: 19.5,
  sheet_h: 11.5,
  margin: 0.25,
  part_gap: 0.08,
  allow_rotation: true,
  kerf: 0.008,
  t: 0.118,
}

const defaultBook: Omit<BookJob, "id" | "name"> = {
  H_ext: 10.0,
  W_ext: 9.0,
  D_ext: 1.5,
  clear_side: 0.06,
  clear_depth: 0.06,
  h_visible: 0.3,
  raise_gap: 0.15,
  tab_w_rule: 0.5,
  joint_clear: 0.004,
  symmetric_ends: true,
  hinge_edge: "FORE",
  tape_reserved_strip: 0.35,
  tape_guide: true,
  mag_count: 2,
  mag_diam: 0.157,
  mag_thick: 0.079,
  mag_clear: 0.008,
  mag_edge_offset: 0.5,
}

export default function BookLightGeneratorPage() {
  const [globals, setGlobals] = useState<Globals>(defaultGlobals)
  const [books, setBooks] = useState<BookJob[]>([])
  const [generatedSvgs, setGeneratedSvgs] = useState<string[]>([])
  const { toast } = useToast()

  const handleAddBook = () => {
    const newBook: BookJob = {
      id: `book-${Date.now()}`,
      name: `Book-${(books.length + 1).toString().padStart(3, "0")}`,
      ...defaultBook,
    }
    setBooks([...books, newBook])
  }

  const handleUpdateBook = (updatedBook: BookJob) => {
    setBooks(books.map((book) => (book.id === updatedBook.id ? updatedBook : book)))
  }

  const handleRemoveBook = (bookId: string) => {
    setBooks(books.filter((book) => book.id !== bookId))
  }

  const handleGenerate = () => {
    if (books.length === 0) {
      toast({
        title: "No Books Added",
        description: "Please add at least one book before generating the layout.",
        variant: "destructive",
      })
      return
    }
    try {
      const placedParts = generatePlacedParts(books, globals)
      const svgs = renderSheetsAsSvgs(placedParts, globals)
      setGeneratedSvgs(svgs)
      toast({
        title: "Layout Generated",
        description: `Successfully packed ${placedParts.length} parts onto ${svgs.length} sheet(s).`,
      })
    } catch (error) {
      console.error("Generation failed:", error)
      toast({
        title: "Generation Failed",
        description: error instanceof Error ? error.message : "An unknown error occurred.",
        variant: "destructive",
      })
    }
  }

  const handleDownloadAll = () => {
    if (generatedSvgs.length === 0) return
    generatedSvgs.forEach((svgString, i) => {
      const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" })
      saveAs(blob, `sheet_${i + 1}.svg`)
    })
  }

  const handleDownloadPerBook = () => {
    if (books.length === 0) return

    books.forEach((book) => {
      try {
        const placedParts = generatePlacedParts([book], globals)
        const svgs = renderSheetsAsSvgs(placedParts, globals, `book_${book.name}`)

        svgs.forEach((svgString, i) => {
          const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" })
          const fileName = svgs.length > 1 ? `book_${book.name}_sheet_${i + 1}.svg` : `book_${book.name}.svg`
          saveAs(blob, fileName)
        })
      } catch (error) {
        console.error(`Failed to generate SVG for ${book.name}:`, error)
        toast({
          title: `Failed for ${book.name}`,
          description: error instanceof Error ? error.message : "An unknown error occurred.",
          variant: "destructive",
        })
      }
    })
  }

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-gray-50 text-gray-900">
        <header className="bg-white border-b sticky top-0 z-10">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-3 flex justify-between items-center">
            <div>
              <h1 className="text-xl font-bold">Acrylic Book Light Case Generator</h1>
              <p className="text-sm text-gray-500">v1.01 — UI Clarifications</p>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={handleGenerate} disabled={books.length === 0}>
                <Package className="mr-2 h-4 w-4" />
                Pack Sheets
              </Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={handleDownloadAll}
                    variant="outline"
                    size="icon"
                    disabled={generatedSvgs.length === 0}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Download All Sheets</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button onClick={handleDownloadPerBook} variant="outline" size="icon" disabled={books.length === 0}>
                    <Download className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Download Per-Book SVGs</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </header>

        <main className="container mx-auto p-4 sm:p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          <div className="lg:col-span-1 flex flex-col gap-8">
            <GlobalsForm globals={globals} onUpdate={setGlobals} />
            <BookList
              books={books}
              onAddBook={handleAddBook}
              onUpdateBook={handleUpdateBook}
              onRemoveBook={handleRemoveBook}
            />
          </div>

          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>SVG Preview</CardTitle>
                <CardDescription>
                  {generatedSvgs.length > 0
                    ? `Generated ${generatedSvgs.length} sheet(s). Scroll to see all sheets.`
                    : "Click 'Pack Sheets' to generate the layout."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="w-full whitespace-nowrap rounded-md border">
                  <div className="flex space-x-4 p-4 bg-gray-100">
                    {generatedSvgs.length > 0 ? (
                      generatedSvgs.map((svg, index) => (
                        <div key={index} className="flex-shrink-0">
                          <h3 className="text-sm font-semibold mb-2">Sheet {index + 1}</h3>
                          <div
                            className="bg-white shadow-md"
                            dangerouslySetInnerHTML={{ __html: svg }}
                            style={{ width: `${globals.sheet_w}in`, height: `${globals.sheet_h}in`, maxWidth: "80vw" }}
                          />
                        </div>
                      ))
                    ) : (
                      <div className="w-full h-96 flex items-center justify-center text-gray-400">
                        Preview will appear here
                      </div>
                    )}
                  </div>
                  <ScrollBar orientation="horizontal" />
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </TooltipProvider>
  )
}
