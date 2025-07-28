"use client"

import type { Globals } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"

interface GlobalsFormProps {
  globals: Globals
  onUpdate: (newGlobals: Globals) => void
}

export function GlobalsForm({ globals, onUpdate }: GlobalsFormProps) {
  const handleChange = (field: keyof Globals, value: string | number | boolean) => {
    if (typeof value === "string" && typeof globals[field] === "number") {
      const num = Number.parseFloat(value)
      onUpdate({ ...globals, [field]: isNaN(num) ? 0 : num })
    } else {
      onUpdate({ ...globals, [field]: value })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sheet & Material Settings</CardTitle>
        <CardDescription>Define the acrylic sheet size and material properties for packing.</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="sheet_w">Sheet Width (in)</Label>
          <Input
            id="sheet_w"
            type="number"
            value={globals.sheet_w}
            onChange={(e) => handleChange("sheet_w", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sheet_h">Sheet Height (in)</Label>
          <Input
            id="sheet_h"
            type="number"
            value={globals.sheet_h}
            onChange={(e) => handleChange("sheet_h", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="margin">Margin (in)</Label>
          <Input
            id="margin"
            type="number"
            value={globals.margin}
            onChange={(e) => handleChange("margin", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="part_gap">Part Gap (in)</Label>
          <Input
            id="part_gap"
            type="number"
            value={globals.part_gap}
            onChange={(e) => handleChange("part_gap", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="kerf">Kerf (in)</Label>
          <Input id="kerf" type="number" value={globals.kerf} onChange={(e) => handleChange("kerf", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="t">Material Thickness (in)</Label>
          <Input id="t" type="number" value={globals.t} onChange={(e) => handleChange("t", e.target.value)} />
        </div>
        <div className="flex items-center space-x-2 col-span-2">
          <Switch
            id="allow_rotation"
            checked={globals.allow_rotation}
            onCheckedChange={(checked) => handleChange("allow_rotation", checked)}
          />
          <Label htmlFor="allow_rotation">Allow Part Rotation</Label>
        </div>
      </CardContent>
    </Card>
  )
}
