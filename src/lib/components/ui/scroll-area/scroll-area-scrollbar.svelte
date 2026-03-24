<script lang="ts">
	import { ScrollArea as ScrollAreaPrimitive } from "bits-ui";
	import { cn } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		orientation = "vertical",
		...restProps
	}: ScrollAreaPrimitive.ScrollbarProps = $props();
</script>

<ScrollAreaPrimitive.Scrollbar
	bind:ref
	{orientation}
	data-slot="scroll-area-scrollbar"
	class={cn(
		"flex touch-none select-none transition-colors",
		orientation === "vertical" && "h-full w-2.5 border-l border-l-transparent p-px",
		orientation === "horizontal" && "h-2.5 flex-col border-t border-t-transparent p-px",
		className
	)}
	{...restProps}
>
	<ScrollAreaPrimitive.Thumb
		data-slot="scroll-area-thumb"
		class="bg-border relative flex-1 rounded-full"
	/>
</ScrollAreaPrimitive.Scrollbar>
