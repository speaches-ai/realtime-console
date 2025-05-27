import { SingleRowInput } from "./shared";
import useStore from "../store";

export function ConnectionSettings() {
  const { baseUrl, setBaseUrl, model, setModel } = useStore();

  return (
    <section className="flex flex-col flex-1">
      <form>
        <SingleRowInput
          label="Base URL"
          value={baseUrl}
          onChange={(value) => {
            setBaseUrl(value);
          }}
        />
        <SingleRowInput
          label="Model"
          value={model}
          onChange={(value) => {
            setModel(value);
          }}
        />
      </form>
    </section>
  );
}
