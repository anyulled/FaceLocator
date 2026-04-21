aws_region                       = "eu-west-1"
aws_profile                      = "face-locator-operator"
database_network_migration_phase = "private"
database_private_subnets = [
  { availability_zone = "eu-west-1a", cidr_block = "172.31.200.0/24" },
  { availability_zone = "eu-west-1b", cidr_block = "172.31.201.0/24" }
]
