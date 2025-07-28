"use client"

import type { BookJob } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { BookForm } from "@/components/book-form"
import { Plus, Trash2 } from "lucide-react"

interface BookListProps {
  books: BookJob[]
  onAddBook: () => void
  onUpdateBook: (book: BookJob) => void
  onRemoveBook: (bookId: string) => void
}

export function BookList({ books, onAddBook, onUpdateBook, onRemoveBook }: BookListProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Book Cases to Generate</CardTitle>
          <CardDescription className="pt-1">Add one or more books to generate cases for.</CardDescription>
        </div>
        <Button onClick={onAddBook} size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Add Book
        </Button>
      </CardHeader>
      <CardContent>
        {books.length > 0 ? (
          <Accordion type="single" collapsible className="w-full">
            {books.map((book) => (
              <AccordionItem key={book.id} value={book.id}>
                <AccordionTrigger className="flex justify-between items-center">
                  <span>{book.name}</span>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="relative">
                    <BookForm book={book} onUpdate={onUpdateBook} />
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute top-0 right-0"
                      onClick={() => onRemoveBook(book.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        ) : (
          <p className="text-sm text-gray-500 text-center py-4">No books added yet.</p>
        )}
      </CardContent>
    </Card>
  )
}
