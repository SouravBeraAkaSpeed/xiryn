"use client"

import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
import { ShuffleIcon, Trash2Icon } from "lucide-react"
import { nanoid } from "nanoid"
import { Controller, useForm, useWatch } from "react-hook-form"

import { createAgent, deleteAgent, updateAgent } from "@/actions/agents"
import { Confirm } from "@/components/confirm"
import { Glyph } from "@/components/glyph"
import { ModelPicker, ModelSightNote } from "@/components/model-picker"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import {
  agentTemplates,
  useWorkspace,
  type AgentTemplate,
} from "@/components/workspace/context"
import { agentInputSchema } from "@/db/schema"
import type { NavAgent } from "@/queries/workspace"

function AgentForm({ agent, template }: { agent?: NavAgent; template?: AgentTemplate }) {
  const router = useRouter()
  const { status, closeDialog } = useWorkspace()
  const [initialGlyph] = React.useState(
    () => agent?.glyph ?? template?.glyph ?? nanoid(10)
  )

  const form = useForm({
    resolver: zodResolver(agentInputSchema),
    defaultValues: {
      name: agent?.name ?? template?.name ?? "",
      role: agent?.role ?? template?.role ?? "",
      instructions: agent?.instructions ?? template?.instructions ?? "",
      model: agent?.model ?? "",
      glyph: initialGlyph,
    },
  })
  const { isSubmitting } = form.formState

  const applyTemplate = (next: AgentTemplate) => {
    const options = { shouldDirty: true, shouldValidate: true }
    form.setValue("name", next.name, options)
    form.setValue("role", next.role, options)
    form.setValue("instructions", next.instructions, options)
    form.setValue("glyph", next.glyph, options)
  }

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      if (agent) {
        const updated = await updateAgent(agent.id, values)
        toast.add({ type: "success", title: `${updated.name} updated` })
        closeDialog()
      } else {
        const { agent: created, threadId } = await createAgent(values)
        toast.add({ type: "success", title: `${created.name} is online` })
        closeDialog()
        router.push(`/a/${created.id}/${threadId}`)
      }
    } catch (error) {
      toast.add({
        type: "error",
        title: agent ? "Couldn't save the agent" : "Couldn't create the agent",
        description: error instanceof Error ? error.message : undefined,
      })
    }
  })

  const instructions = useWatch({ control: form.control, name: "instructions" }) ?? ""

  return (
    <form onSubmit={onSubmit} className="flex min-h-0 flex-col">
      <DialogHeader className="gap-1 border-b px-5 pt-5 pb-4">
        <span className="label-mono">
          {agent ? "// configure agent" : "// new agent"}
        </span>
        <DialogTitle className="text-lg font-semibold tracking-tight">
          {agent ? agent.name : "Create an agent"}
        </DialogTitle>
        <DialogDescription>
          {agent
            ? "Identity, standing orders and the model it thinks with."
            : "An agent gets its own workstation, its own memory and the model you pick."}
        </DialogDescription>
      </DialogHeader>

      <div className="flex min-h-0 flex-col gap-5 overflow-y-auto px-5 py-5">
        {!agent && (
          <div className="flex flex-col gap-2">
            <span className="label-mono">Start from</span>
            <div className="grid max-h-[148px] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-4">
              {agentTemplates.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyTemplate(preset)}
                  className="flex flex-col items-start gap-0.5 rounded-md border bg-background/40 px-2.5 py-2 text-left transition-colors hover:border-input hover:bg-accent/50"
                >
                  <span className="text-[13px] font-medium">{preset.name}</span>
                  <span className="line-clamp-1 font-mono text-[10.5px] text-muted-foreground">
                    {preset.role}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <FieldGroup className="gap-4">
          <div className="flex items-start gap-4">
            <Controller
              name="glyph"
              control={form.control}
              render={({ field }) => (
                <div className="flex flex-col items-center gap-1.5">
                  <Glyph seed={field.value ?? initialGlyph} className="size-[60px]" />
                  <button
                    type="button"
                    onClick={() => field.onChange(nanoid(10))}
                    className="inline-flex items-center gap-1 font-mono text-[10.5px] text-muted-foreground hover:text-foreground"
                  >
                    <ShuffleIcon className="size-3" />
                    reroll
                  </button>
                </div>
              )}
            />
            <div className="grid flex-1 gap-3">
              <Controller
                name="name"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="agent-name">Name</FieldLabel>
                    <Input
                      {...field}
                      id="agent-name"
                      placeholder="Vega"
                      autoComplete="off"
                      aria-invalid={fieldState.invalid}
                    />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              <Controller
                name="role"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="agent-role">Role</FieldLabel>
                    <Input
                      {...field}
                      id="agent-role"
                      placeholder="Research analyst"
                      autoComplete="off"
                      aria-invalid={fieldState.invalid}
                    />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            </div>
          </div>

          <Controller
            name="model"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="agent-model">Model</FieldLabel>
                <ModelPicker
                  id="agent-model"
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  providers={status.providerOptions}
                  defaultSpec={status.defaultModel}
                  allowDefault
                  invalid={fieldState.invalid}
                />
                <FieldDescription>
                  Workstation tasks need a model that supports tools and images.
                </FieldDescription>
                <ModelSightNote spec={field.value || status.defaultModel} />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />

          <Controller
            name="instructions"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <div className="flex items-baseline justify-between">
                  <FieldLabel htmlFor="agent-instructions">Standing orders</FieldLabel>
                  <span className="font-mono text-[10.5px] text-faint tabular-nums">
                    {instructions.length}/6000
                  </span>
                </div>
                <Textarea
                  {...field}
                  value={field.value ?? ""}
                  id="agent-instructions"
                  placeholder="How should it work? What should it always or never do?"
                  className="max-h-64 min-h-28 text-[13px] leading-relaxed"
                  aria-invalid={fieldState.invalid}
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
        </FieldGroup>
      </div>

      <DialogFooter className="mx-0 mb-0 items-center rounded-b-xl px-5 py-3">
        {agent && (
          <Confirm
            trigger={
              <Button
                type="button"
                variant="ghost"
                className="text-destructive sm:mr-auto"
              >
                <Trash2Icon data-icon="inline-start" />
                Delete
              </Button>
            }
            title={`Delete ${agent.name}?`}
            description="Anything it's doing is stopped first. Its threads, its memory and its workstation (including every file on it) are deleted. This can't be undone."
            action="Delete agent"
            onConfirm={async () => {
              try {
                const result = await deleteAgent(agent.id)
                if (!result.ok) throw new Error(result.error)
                toast.add({
                  type: "success",
                  title: `${agent.name} deleted`,
                  description:
                    result.machine === "later"
                      ? "Its workstation is removed once Docker is running."
                      : undefined,
                })
                closeDialog()
                router.push("/")
              } catch (error) {
                toast.add({
                  type: "error",
                  title: "Couldn't delete the agent",
                  description: error instanceof Error ? error.message : undefined,
                })
              }
            }}
          />
        )}
        <DialogClose render={<Button type="button" variant="outline" />}>
          Cancel
        </DialogClose>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Spinner data-icon="inline-start" />}
          {agent ? "Save" : "Create agent"}
        </Button>
      </DialogFooter>
    </form>
  )
}

export function AgentDialog() {
  const { dialog, closeDialog } = useWorkspace()
  const state = dialog?.kind === "agent" ? dialog : null

  return (
    <Dialog open={!!state} onOpenChange={(open) => !open && closeDialog()}>
      <DialogContent className="flex max-h-[min(90svh,760px)] flex-col gap-0 p-0 sm:max-w-xl">
        {state && (
          <AgentForm
            key={state.agent?.id ?? state.template?.name ?? "new"}
            agent={state.agent}
            template={state.template}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
