const rows = [
  { name: "Board Infinity", status: "En cours", eta: "Demain", owner: "Léna" },
  { name: "Refonte IA", status: "Planifié", eta: "08/09", owner: "Nico" },
  { name: "Sprint Mobile", status: "Livré", eta: "Hier", owner: "Sam" },
];

export function StyledTableExample() {
  return (
    <div className="table-shell surface-elevated">
      <table>
        <thead>
          <tr>
            <th>Projet</th>
            <th>Statut</th>
            <th>Échéance</th>
            <th>Référent</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name}>
              <td className="title-text font-semibold">{row.name}</td>
              <td>
                <span className="chip text-xs">{row.status}</span>
              </td>
              <td className="muted-text">{row.eta}</td>
              <td className="title-text">{row.owner}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
