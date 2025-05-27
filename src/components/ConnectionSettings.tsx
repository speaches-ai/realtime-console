import { SingleRowInput } from "./shared";

export function ConnectionSettings(props: {
  baseUrl: string;
  setBaseUrl: (arg0: string) => void;
  model: string;
  setModel: (arg0: string) => void;
}) {
  return (
    <section className="flex flex-col flex-1 border-gray-200">
      <h1>Connection Settings</h1>
      <form>
        <SingleRowInput
          label="Base URL"
          value={props.baseUrl}
          onChange={props.setBaseUrl}
        />
        <SingleRowInput
          label="Model"
          value={props.model}
          onChange={props.setModel}
        />
      </form>
    </section>
  );
}
