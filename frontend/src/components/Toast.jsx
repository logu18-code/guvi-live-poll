// Brief confirmation message. The parent clears it after a few seconds.
export default function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className="toast" id="toast" key={toast.id} data-type={toast.type}>
      {toast.text}
    </div>
  );
}
