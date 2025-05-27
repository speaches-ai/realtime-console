import { SingleRowInput } from "./shared";

const saveToLocalStorage = (key: string, value: string) => {
  localStorage.setItem(`connection-${key}`, value);
};

export function ConnectionSettings(props: {
  baseUrl: string;
  setBaseUrl: (arg0: string) => void;
  model: string;
  setModel: (arg0: string) => void;
}) {
  return (
    <section className="flex flex-col flex-1">
      <form>
        <SingleRowInput
          label="Base URL"
          value={props.baseUrl}
          onChange={(value) => {
            props.setBaseUrl(value);
            saveToLocalStorage("baseUrl", value);
          }}
        />
        <SingleRowInput
          label="Model"
          value={props.model}
          onChange={(value) => {
            props.setModel(value);
            saveToLocalStorage("model", value);
          }}
        />
      </form>
    </section>
  );
}
