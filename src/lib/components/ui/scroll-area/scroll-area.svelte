<script lang="ts">
	import { ScrollArea as ScrollAreaPrimitive } from "bits-ui";
	import { cn } from "$lib/utils.js";
	import ScrollBar from "./scroll-area-scrollbar.svelte";

	let {
		ref = $bindable(null),
		class: className,
		orientation = "vertical",
		scrollbarXClasses,
		scrollbarYClasses,
		children,
		...restProps
	}: ScrollAreaPrimitive.RootProps & {
		orientation?: "vertical" | "horizontal" | "both";
		scrollbarXClasses?: string;
		scrollbarYClasses?: string;
	} = $props();
</script>

<ScrollAreaPrimitive.Root
	bind:ref
	data-slot="scroll-area"
	class={cn("relative overflow-hidden", className)}
	{...restProps}
>
	<ScrollAreaPrimitive.Viewport
		data-slot="scroll-area-viewport"
		class="h-full w-full rounded-[inherit]"
	>
		{@render children?.()}
	</ScrollAreaPrimitive.Viewport>
	{#if orientation === "vertical" || orientation === "both"}
		<ScrollBar orientation="vertical" class={scrollbarYClasses} />
	{/if}
	{#if orientation === "horizontal" || orientation === "both"}
		<ScrollBar orientation="horizontal" class={scrollbarXClasses} />
	{/if}
	<ScrollAreaPrimitive.Corner />
</ScrollAreaPrimitive.Root>
