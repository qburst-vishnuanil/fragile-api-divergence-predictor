// Mock user DB
let users = [
    { id: 1, name: "Vishnu", role: "tester" },
    { id: 2, name: "Aravind Mahadevan", role: "developer" }
  ];
  
  // GET /users
  export const getUsers = (req, res) => {
    return res.status(200).json(users);
  };
  
  // POST /users
  export const createUser = (req, res) => {
    const { name, role } = req.body;
  
    if (!name || !role) {
      return res.status(400).json({
        error: "name and role are required"
      });
    }
  
    const newUser = {
      id: users.length + 1,
      name,
      role
    };
  
    users.push(newUser);
  
    return res.status(201).json(newUser);
  };
  
  // GET /users/:id
  export const getUserById = (req, res) => {
    const { id } = req.params;
    const user = users.find(u => u.id === Number(id));
  
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
  
    return res.status(200).json(user);
  };
  