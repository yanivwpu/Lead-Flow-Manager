import * as React from "react";

function App() {
  const [count, setCount] = React.useState(0);
  
  React.useEffect(() => {
    console.log("App mounted");
  }, []);

  return (
    <div style={{ padding: 20, fontFamily: 'sans-serif' }}>
      <h1>ChatCRM Test</h1>
      <p>Count: {count}</p>
      <button onClick={() => setCount(c => c + 1)}>Increment</button>
    </div>
  );
}

export default App;
