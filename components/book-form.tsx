"use client"

import type { BookJob } from "@/lib/types"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface BookFormProps {
  book: BookJob
  onUpdate: (updatedBook: BookJob) => void
}

export function BookForm({ book, onUpdate }: BookFormProps) {
  const handleChange = (field: keyof BookJob, value: string | number | boolean) => {
    if (typeof value === "string" && typeof book[field] === "number") {
      const num = Number.parseFloat(value)
      // For mag_count, which is an integer from a select, we parse differently
      if (field === "mag_count") {
        const intNum = Number.parseInt(value, 10)
        onUpdate({ ...book, [field]: isNaN(intNum) ? 0 : intNum })
      } else {
        onUpdate({ ...book, [field]: isNaN(num) ? 0 : num })
      }
    } else {
      onUpdate({ ...book, [field]: value })
    }
  }

  return (
    <div className="space-y-4 p-1 pr-12">
      <div className="space-y-2">
        <Label htmlFor={`name-${book.id}`}>Job Name</Label>
        <Input id={`name-${book.id}`} value={book.name} onChange={(e) => handleChange("name", e.target.value)} />
      </div>
      <h4 className="font-semibold text-sm pt-2">External Dimensions</h4>
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-2">
          <Label htmlFor={`H_ext-${book.id}`}>Book Height</Label>
          <Input
            id={`H_ext-${book.id}`}
            type="number"
            value={book.H_ext}
            onChange={(e) => handleChange("H_ext", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`W_ext-${book.id}`}>Book Width</Label>
          <Input
            id={`W_ext-${book.id}`}
            type="number"
            value={book.W_ext}
            onChange={(e) => handleChange("W_ext", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`D_ext-${book.id}`}>Book Depth</Label>
          <Input
            id={`D_ext-${book.id}`}
            type="number"
            value={book.D_ext}
            onChange={(e) => handleChange("D_ext", e.target.value)}
          />
        </div>
      </div>
      <h4 className="font-semibold text-sm pt-2">Clearances & Glow</h4>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-2">
          <Label htmlFor={`clear_side-${book.id}`}>Side Clear.</Label>
          <Input
            id={`clear_side-${book.id}`}
            type="number"
            value={book.clear_side}
            onChange={(e) => handleChange("clear_side", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`clear_depth-${book.id}`}>Depth Clear.</Label>
          <Input
            id={`clear_depth-${book.id}`}
            type="number"
            value={book.clear_depth}
            onChange={(e) => handleChange("clear_depth", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`h_visible-${book.id}`}>Visible Glow</Label>
          <Input
            id={`h_visible-${book.id}`}
            type="number"
            value={book.h_visible}
            onChange={(e) => handleChange("h_visible", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`raise_gap-${book.id}`}>Raise Gap</Label>
          <Input
            id={`raise_gap-${book.id}`}
            type="number"
            value={book.raise_gap}
            onChange={(e) => handleChange("raise_gap", e.target.value)}
          />
        </div>
      </div>
      <h4 className="font-semibold text-sm pt-2">Joints & Hinge</h4>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-2">
          <Label htmlFor={`tab_w_rule-${book.id}`}>Tab Width Rule</Label>
          <Input
            id={`tab_w_rule-${book.id}`}
            type="number"
            value={book.tab_w_rule}
            onChange={(e) => handleChange("tab_w_rule", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`joint_clear-${book.id}`}>Joint Clearance</Label>
          <Input
            id={`joint_clear-${book.id}`}
            type="number"
            value={book.joint_clear}
            onChange={(e) => handleChange("joint_clear", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`tape_reserved_strip-${book.id}`}>Tape Strip</Label>
          <Input
            id={`tape_reserved_strip-${book.id}`}
            type="number"
            value={book.tape_reserved_strip}
            onChange={(e) => handleChange("tape_reserved_strip", e.target.value)}
          />
        </div>
        <div className="flex items-center space-x-2 pt-6">
          <Switch
            id={`symmetric_ends-${book.id}`}
            checked={book.symmetric_ends}
            onCheckedChange={(c) => handleChange("symmetric_ends", c)}
          />
          <Label htmlFor={`symmetric_ends-${book.id}`}>Symmetric Ends</Label>
        </div>
      </div>
      <h4 className="font-semibold text-sm pt-2">Magnets (Base Only)</h4>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-2">
          <Label htmlFor={`mag_count-${book.id}`}>Count</Label>
          <Select value={String(book.mag_count)} onValueChange={(v) => handleChange("mag_count", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">0</SelectItem>
              <SelectItem value="2">2</SelectItem>
              <SelectItem value="4">4</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`mag_diam-${book.id}`}>Diameter</Label>
          <Input
            id={`mag_diam-${book.id}`}
            type="number"
            value={book.mag_diam}
            onChange={(e) => handleChange("mag_diam", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`mag_clear-${book.id}`}>Clearance</Label>
          <Input
            id={`mag_clear-${book.id}`}
            type="number"
            value={book.mag_clear}
            onChange={(e) => handleChange("mag_clear", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`mag_edge_offset-${book.id}`}>Edge Offset</Label>
          <Input
            id={`mag_edge_offset-${book.id}`}
            type="number"
            value={book.mag_edge_offset}
            onChange={(e) => handleChange("mag_edge_offset", e.target.value)}
          />
        </div>
      </div>
    </div>
  )
}
