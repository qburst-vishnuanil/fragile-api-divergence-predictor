export const getUsers = (req, res) => {
    res.json([
      { id: 1, name: "Vishnu", role: "tester" },
      { id: 2, name: "Aravind", role: "developer" }
    ]);
  };
  