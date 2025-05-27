import { ListPromptsResult } from "@modelcontextprotocol/sdk/types.js";

interface PromptListProps {
  prompts: ListPromptsResult["prompts"];
}

export function PromptList({ prompts }: PromptListProps) {
  if (!prompts || prompts.length === 0) {
    return <div className="text-gray-500">No prompts available</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Available Prompts</h2>
      <div className="grid gap-4">
        {prompts.map((prompt) => (
          <div
            key={prompt.name}
            className="border rounded-md p-4 bg-gray-50 dark:bg-gray-800"
          >
            <h3 className="font-medium mb-2">{prompt.name}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {prompt.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
