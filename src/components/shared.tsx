type SliderInputProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
};

export function SliderInput({
  label,
  value,
  onChange,
  min,
  max,
  step,
}: SliderInputProps) {
  return (
    <div>
      <label className="block text-sm text-gray-600">{label}</label>
      <div className="flex items-center gap-4">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="mt-1 block w-full"
        />
        <span className="text-sm text-gray-600">{value}</span>
      </div>
    </div>
  );
}

type SingleRowInputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};

export function SingleRowInput(props: SingleRowInputProps) {
  return (
    <div className="flex flex-row gap-2 p-1 rounded-md items-center">
      <label>{props.label}:</label>
      <input
        type="text"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        className="flex-grow border border-gray-500 rounded-md p-1 bg-inherit"
      />
    </div>
  );
}
